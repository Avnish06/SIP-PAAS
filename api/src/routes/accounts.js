const router = require('express').Router();
const { db } = require('../config/db');
const { requireAuth } = require('../middleware/auth');

/* GET /v1/accounts/me */
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const [rows] = await db().query(
      'SELECT id, email, name, company, phone, status, balance, currency, api_key, created_at FROM customers WHERE id = ?',
      [req.customer.id]
    );
    res.json({ account: rows[0] });
  } catch (err) { next(err); }
});

/* PATCH /v1/accounts/me */
router.patch('/me', requireAuth, async (req, res, next) => {
  try {
    const { name, company, phone } = req.body;
    await db().query(
      'UPDATE customers SET name = COALESCE(?, name), company = COALESCE(?, company), phone = COALESCE(?, phone) WHERE id = ?',
      [name || null, company || null, phone || null, req.customer.id]
    );
    res.json({ message: 'Account updated' });
  } catch (err) { next(err); }
});

/* GET /v1/accounts/stats — dashboard summary */
router.get('/stats', requireAuth, async (req, res, next) => {
  try {
    const [trunks]  = await db().query('SELECT COUNT(*) AS cnt FROM trunks WHERE customer_id = ? AND status = "active"', [req.customer.id]);
    const [dids]    = await db().query('SELECT COUNT(*) AS cnt FROM did_numbers WHERE customer_id = ? AND status = "active"', [req.customer.id]);
    const [today]   = await db().query(
      'SELECT COUNT(*) AS calls, SUM(cost) AS spend FROM cdr WHERE customer_id = ? AND DATE(start_time) = CURDATE()',
      [req.customer.id]
    );
    const [month]   = await db().query(
      'SELECT COUNT(*) AS calls, SUM(cost) AS spend FROM cdr WHERE customer_id = ? AND YEAR(start_time) = YEAR(NOW()) AND MONTH(start_time) = MONTH(NOW())',
      [req.customer.id]
    );
    res.json({
      balance:       req.customer.balance,
      active_trunks: trunks[0].cnt,
      active_dids:   dids[0].cnt,
      today:         today[0],
      this_month:    month[0],
    });
  } catch (err) { next(err); }
});

module.exports = router;
