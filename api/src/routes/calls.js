const router = require('express').Router();
const { db }    = require('../config/db');
const { redis } = require('../config/redis');
const { requireAuth } = require('../middleware/auth');
const { originateCall } = require('../services/asterisk');
const { kamailioRpc }  = require('../services/kamailio');

/* GET /v1/calls/active — live channel count per trunk */
router.get('/active', requireAuth, async (req, res, next) => {
  try {
    const channels = await redis().get(`sipaas:channels:${req.customer.id}`);
    res.json({ active_channels: parseInt(channels || '0') });
  } catch (err) { next(err); }
});

/* GET /v1/calls/cdr — call history */
router.get('/cdr', requireAuth, async (req, res, next) => {
  try {
    const page    = parseInt(req.query.page  || '1');
    const limit   = parseInt(req.query.limit || '50');
    const offset  = (page - 1) * limit;
    const { from, to } = req.query;

    let sql = `SELECT id, src, dst, start_time, answer_time, end_time, duration, billsec,
                      disposition, cost, rate, direction, provider
               FROM cdr WHERE customer_id = ?`;
    const params = [req.customer.id];

    if (from) { sql += ' AND start_time >= ?'; params.push(from); }
    if (to)   { sql += ' AND start_time <= ?'; params.push(to);   }
    sql += ' ORDER BY start_time DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [rows] = await db().query(sql, params);

    const [total] = await db().query(
      'SELECT COUNT(*) AS cnt, SUM(billsec) AS total_secs, SUM(cost) AS total_cost FROM cdr WHERE customer_id = ?',
      [req.customer.id]
    );
    res.json({ cdrs: rows, total: total[0], page, limit });
  } catch (err) { next(err); }
});

/*
 * POST /v1/calls/originate
 * Trigger outbound call — matches Section 7.3 of the guide.
 * Uses Kamailio JSON-RPC uac.request (primary) with Asterisk ARI as fallback.
 *
 * Equivalent to the guide's:
 *   curl -X POST http://localhost:5060/RPC
 *     -d '{"jsonrpc":"2.0","method":"uac.request","params":{...}}'
 */
router.post('/originate', requireAuth, async (req, res, next) => {
  try {
    const { from, to, trunk_id, headers: extraHeaders } = req.body;
    if (!from || !to || !trunk_id) return res.status(400).json({ error: 'from, to, trunk_id required' });

    /* Verify trunk belongs to customer */
    const [trunks] = await db().query(
      'SELECT * FROM trunks WHERE id = ? AND customer_id = ? AND status = "active"',
      [trunk_id, req.customer.id]
    );
    if (!trunks.length) return res.status(403).json({ error: 'Trunk not found' });

    /* Balance check */
    if (parseFloat(req.customer.balance) <= 0) return res.status(402).json({ error: 'Insufficient balance' });

    const domain  = process.env.DOMAIN;
    const fromUri = from.includes('@') ? `sip:${from}` : `sip:${from}@${domain}`;
    const toUri   = to.includes('@')   ? `sip:${to}`   : `sip:${to}@${domain}`;

    /* ── Primary: Kamailio JSON-RPC uac.request (guide Section 7.3) ── */
    let callId;
    try {
      callId = await kamailioRpc('uac.request', {
        method:  'INVITE',
        ruri:    toUri,
        from:    fromUri,
        to:      toUri,
        headers: `X-Customer-ID: ${req.customer.id}\r\nX-Trunk-ID: ${trunk_id}${extraHeaders ? `\r\n${extraHeaders}` : ''}`,
      });
    } catch (rpcErr) {
      /* ── Fallback: Asterisk ARI originate ── */
      callId = await originateCall({ from, to, trunk: trunks[0], customerId: req.customer.id });
    }

    res.json({ call_id: callId, status: 'originating', from: fromUri, to: toUri });
  } catch (err) { next(err); }
});

module.exports = router;
