const router = require('express').Router();
const { db }    = require('../config/db');
const { redis } = require('../config/redis');
const { requireAuth } = require('../middleware/auth');

/* GET /v1/billing/balance */
router.get('/balance', requireAuth, async (req, res, next) => {
  try {
    const [rows] = await db().query('SELECT balance, currency FROM customers WHERE id = ?', [req.customer.id]);
    /* Sync balance to Redis (Kamailio reads from here) */
    await redis().set(`sipaas:balance:${req.customer.id}`, rows[0].balance.toString());
    res.json({ balance: rows[0].balance, currency: rows[0].currency });
  } catch (err) { next(err); }
});

/* POST /v1/billing/topup — add balance (stub: integrate Razorpay/Stripe here) */
router.post('/topup', requireAuth, async (req, res, next) => {
  try {
    const { amount, payment_ref } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

    const conn = await db().getConnection();
    await conn.beginTransaction();
    try {
      const [rows] = await conn.query('SELECT balance FROM customers WHERE id = ? FOR UPDATE', [req.customer.id]);
      const before = parseFloat(rows[0].balance);
      const after  = before + parseFloat(amount);

      await conn.query('UPDATE customers SET balance = ? WHERE id = ?', [after, req.customer.id]);
      await conn.query(
        'INSERT INTO billing_transactions (customer_id, type, amount, balance_before, balance_after, reference_id, description) VALUES (?,?,?,?,?,?,?)',
        [req.customer.id, 'topup', amount, before, after, payment_ref || null, `Top-up ₹${amount}`]
      );
      await conn.commit();
      conn.release();

      /* Sync to Redis */
      await redis().set(`sipaas:balance:${req.customer.id}`, after.toString());

      res.json({ balance: after, currency: 'INR' });
    } catch (e) { await conn.rollback(); conn.release(); throw e; }
  } catch (err) { next(err); }
});

/* GET /v1/billing/transactions */
router.get('/transactions', requireAuth, async (req, res, next) => {
  try {
    const page  = parseInt(req.query.page || '1');
    const limit = parseInt(req.query.limit || '50');
    const offset = (page - 1) * limit;

    const [rows] = await db().query(
      'SELECT id, type, amount, balance_before, balance_after, description, created_at FROM billing_transactions WHERE customer_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [req.customer.id, limit, offset]
    );
    res.json({ transactions: rows, page, limit });
  } catch (err) { next(err); }
});

/* GET /v1/billing/invoice/:month  (format: 2026-01) */
router.get('/invoice/:month', requireAuth, async (req, res, next) => {
  try {
    const { month } = req.params;
    const [calls] = await db().query(
      `SELECT COUNT(*) AS call_count, SUM(billsec) AS total_secs, SUM(cost) AS total_cost
       FROM cdr WHERE customer_id = ? AND DATE_FORMAT(start_time, '%Y-%m') = ? AND disposition = 'ANSWERED'`,
      [req.customer.id, month]
    );
    const [dids] = await db().query(
      `SELECT COUNT(*) AS did_count, SUM(monthly_rate) AS did_cost
       FROM did_numbers WHERE customer_id = ? AND DATE_FORMAT(assigned_at, '%Y-%m') <= ? AND status != 'cancelled'`,
      [req.customer.id, month]
    );
    res.json({
      month,
      calls:    calls[0],
      dids:     dids[0],
      total_due: (parseFloat(calls[0].total_cost || 0) + parseFloat(dids[0].did_cost || 0)).toFixed(4),
      currency: 'INR',
    });
  } catch (err) { next(err); }
});

module.exports = router;
