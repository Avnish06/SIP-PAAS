const router = require('express').Router();
const { db }    = require('../config/db');
const { redis } = require('../config/redis');

/*
 * POST /v1/webhooks/cdr — called by Asterisk AGI/AMI after call ends
 * This endpoint receives CDR data, stores it, deducts balance, fires customer webhook.
 */
router.post('/cdr', async (req, res) => {
  try {
    const {
      callid, customer_id, trunk_id, src, dst,
      start_time, answer_time, end_time,
      duration, billsec, disposition,
      direction = 'outbound', provider = 'tata',
    } = req.body;

    if (!callid || !customer_id) return res.status(400).json({ error: 'callid and customer_id required' });

    /* Determine rate */
    const prefix  = (dst || '').replace(/\d+$/, '').substring(0, 6);
    const [rates] = await db().query(
      `SELECT rate_per_min, billing_increment FROM rate_cards
       WHERE (customer_id = ? OR customer_id IS NULL)
         AND ? LIKE CONCAT(prefix, '%')
         AND active = 1
       ORDER BY CHAR_LENGTH(prefix) DESC, customer_id DESC LIMIT 1`,
      [customer_id, dst]
    );
    const rate      = rates.length ? parseFloat(rates[0].rate_per_min) : parseFloat(process.env.RATE_PER_MIN || '0.45');
    const increment = rates.length ? rates[0].billing_increment : 60;
    const billedSec = Math.ceil((billsec || 0) / increment) * increment;
    const cost      = (billedSec / 60) * rate;

    /* Insert CDR */
    await db().query(
      `INSERT INTO cdr (callid, customer_id, trunk_id, src, dst, start_time, answer_time, end_time,
                        duration, billsec, disposition, cost, rate, direction, provider, billed)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)
       ON DUPLICATE KEY UPDATE billed = 1`,
      [callid, customer_id, trunk_id, src, dst, start_time, answer_time, end_time,
       duration, billsec, disposition, cost.toFixed(4), rate, direction, provider]
    );

    if (disposition === 'ANSWERED' && cost > 0) {
      /* Deduct balance */
      await db().query('UPDATE customers SET balance = GREATEST(0, balance - ?) WHERE id = ?', [cost, customer_id]);
      await db().query(
        'INSERT INTO billing_transactions (customer_id, type, amount, balance_before, balance_after, reference_id, description) SELECT ?, "call_charge", -?, balance + ?, balance, ?, ? FROM customers WHERE id = ?',
        [customer_id, cost, cost, callid, `Call ${src}→${dst} ${billedSec}s`, customer_id]
      );
      /* Refresh Redis balance */
      const [rows] = await db().query('SELECT balance FROM customers WHERE id = ?', [customer_id]);
      await redis().set(`sipaas:balance:${customer_id}`, rows[0].balance.toString());
    }

    /* Fire customer's webhook if configured */
    const [dids] = await db().query('SELECT webhook_url FROM did_numbers WHERE number = ? AND status = "active"', [dst]);
    if (dids.length && dids[0].webhook_url) {
      fetch(dids[0].webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'call.ended', callid, src, dst, disposition, duration, cost }),
      }).catch(() => {});
    }

    res.json({ ok: true, cost });
  } catch (err) {
    console.error('CDR webhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
