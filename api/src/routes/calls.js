const router = require('express').Router();
const { db }    = require('../config/db');
const { redis } = require('../config/redis');
const { requireAuth } = require('../middleware/auth');
const { originateCall, bridgeCall } = require('../services/asterisk');
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
    const page      = Math.max(1, parseInt(req.query.page  || '1'));
    const limit     = Math.min(100, Math.max(1, parseInt(req.query.limit || '25')));
    const offset    = (page - 1) * limit;
    const { from, to, status, direction } = req.query;

    // Build WHERE clauses — same filters apply to both data query and count query
    const whereClauses = ['customer_id = ?'];
    const whereParams  = [req.customer.id];

    if (from)      { whereClauses.push('start_time >= ?');   whereParams.push(from); }
    if (to)        { whereClauses.push('start_time <= ?');   whereParams.push(to + ' 23:59:59'); }
    if (status && status !== 'all')    { whereClauses.push('disposition = ?');  whereParams.push(status); }
    if (direction && direction !== 'all') { whereClauses.push('direction = ?'); whereParams.push(direction); }

    const where = whereClauses.join(' AND ');

    const [rows] = await db().query(
      `SELECT id, src, dst, start_time, answer_time, end_time, duration, billsec,
              disposition, cost, rate, direction, provider
       FROM cdr WHERE ${where}
       ORDER BY start_time DESC LIMIT ? OFFSET ?`,
      [...whereParams, limit, offset]
    );

    const [total] = await db().query(
      `SELECT COUNT(*) AS cnt, SUM(billsec) AS total_secs, SUM(cost) AS total_cost
       FROM cdr WHERE ${where}`,
      whereParams
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

/*
 * POST /v1/calls/bridge
 * Click-to-call: system calls YOUR number first, then bridges to destination.
 * Body: { my_number: "9876543210", to: "9142436879" }
 */
router.post('/bridge', requireAuth, async (req, res, next) => {
  try {
    const { my_number, to } = req.body;
    if (!my_number || !to) return res.status(400).json({ error: 'my_number and to are required' });
    if (parseFloat(req.customer.balance) <= 0) return res.status(402).json({ error: 'Insufficient balance' });

    const result = await bridgeCall({
      myNumber:   my_number,
      toNumber:   to,
      customerId: req.customer.id,
    });

    res.json({
      status:    'calling_you',
      message:   `Your phone (${result.my_dnis}) will ring — pick up to be connected to ${result.dest_dnis}`,
      my_dnis:   result.my_dnis,
      dest_dnis: result.dest_dnis,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

module.exports = router;
