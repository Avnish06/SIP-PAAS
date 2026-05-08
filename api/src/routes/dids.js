const router = require('express').Router();
const { db } = require('../config/db');
const { requireAuth } = require('../middleware/auth');

/* GET /v1/dids/available — browse available DIDs */
router.get('/available', requireAuth, async (req, res, next) => {
  try {
    const { country = 'IN', type, region } = req.query;
    let sql = 'SELECT id, number, country, region, type, monthly_rate FROM did_inventory WHERE status = "available" AND country = ?';
    const params = [country];
    if (type)   { sql += ' AND type = ?';   params.push(type); }
    if (region) { sql += ' AND region LIKE ?'; params.push(`%${region}%`); }
    sql += ' ORDER BY region, number LIMIT 100';

    const [rows] = await db().query(sql, params);
    res.json({ dids: rows });
  } catch (err) { next(err); }
});

/* GET /v1/dids — list customer's assigned DIDs */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const [rows] = await db().query(
      `SELECT d.id, d.number, d.status, d.monthly_rate, d.renewal_date, d.forward_to, d.webhook_url,
              t.name AS trunk_name, d.trunk_id
       FROM did_numbers d
       JOIN trunks t ON t.id = d.trunk_id
       WHERE d.customer_id = ? AND d.status != "cancelled"
       ORDER BY d.assigned_at DESC`,
      [req.customer.id]
    );
    res.json({ dids: rows });
  } catch (err) { next(err); }
});

/* POST /v1/dids/buy — buy a DID by inventory id (portal-friendly) */
router.post('/buy', requireAuth, async (req, res, next) => {
  try {
    const { did_id, trunk_id } = req.body;
    if (!did_id) return res.status(400).json({ error: 'did_id required' });

    /* Resolve trunk: use provided trunk_id or pick customer's first active trunk */
    let resolvedTrunkId = trunk_id;
    if (!resolvedTrunkId) {
      const [trunks] = await db().query(
        'SELECT id FROM trunks WHERE customer_id = ? AND status = "active" ORDER BY id LIMIT 1',
        [req.customer.id]
      );
      if (!trunks.length) return res.status(400).json({ error: 'No active trunk found. Create a trunk first.' });
      resolvedTrunkId = trunks[0].id;
    } else {
      const [trunks] = await db().query(
        'SELECT id FROM trunks WHERE id = ? AND customer_id = ? AND status = "active"',
        [resolvedTrunkId, req.customer.id]
      );
      if (!trunks.length) return res.status(403).json({ error: 'Trunk not found' });
    }

    const conn = await db().getConnection();
    await conn.beginTransaction();
    try {
      const [inv] = await conn.query(
        'SELECT id, number, monthly_rate FROM did_inventory WHERE id = ? AND status = "available" FOR UPDATE',
        [did_id]
      );
      if (!inv.length) { await conn.rollback(); conn.release(); return res.status(409).json({ error: 'DID no longer available' }); }

      const did        = inv[0];
      const renewal    = new Date(); renewal.setMonth(renewal.getMonth() + 1);
      const renewalStr = renewal.toISOString().split('T')[0];

      const [cust] = await conn.query('SELECT balance FROM customers WHERE id = ? FOR UPDATE', [req.customer.id]);
      if (parseFloat(cust[0].balance) < parseFloat(did.monthly_rate)) {
        await conn.rollback(); conn.release();
        return res.status(402).json({ error: 'Insufficient balance' });
      }

      const [result] = await conn.query(
        'INSERT INTO did_numbers (number, customer_id, trunk_id, monthly_rate, renewal_date) VALUES (?,?,?,?,?)',
        [did.number, req.customer.id, resolvedTrunkId, did.monthly_rate, renewalStr]
      );
      await conn.query('UPDATE did_inventory SET status = "assigned" WHERE id = ?', [did_id]);
      await conn.query('UPDATE customers SET balance = balance - ? WHERE id = ?', [did.monthly_rate, req.customer.id]);
      await conn.query(
        'INSERT INTO billing_transactions (customer_id, type, amount, balance_before, balance_after, reference_id, description) SELECT ?, "did_charge", -?, balance + ?, balance, ?, ? FROM customers WHERE id = ?',
        [req.customer.id, did.monthly_rate, did.monthly_rate, result.insertId, `DID ${did.number} first month`, req.customer.id]
      );

      await conn.commit(); conn.release();
      res.status(201).json({ id: result.insertId, number: did.number, trunk_id: resolvedTrunkId, renewal_date: renewalStr, monthly_rate: did.monthly_rate });
    } catch (e) {
      await conn.rollback(); conn.release(); throw e;
    }
  } catch (err) { next(err); }
});

/* POST /v1/dids — buy a DID */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { number, trunk_id } = req.body;
    if (!number || !trunk_id) return res.status(400).json({ error: 'number and trunk_id required' });

    /* Verify trunk belongs to customer */
    const [trunks] = await db().query(
      'SELECT id FROM trunks WHERE id = ? AND customer_id = ? AND status = "active"',
      [trunk_id, req.customer.id]
    );
    if (!trunks.length) return res.status(403).json({ error: 'Trunk not found' });

    /* Lock + fetch DID from inventory */
    const conn = await db().getConnection();
    await conn.beginTransaction();
    try {
      const [inv] = await conn.query(
        'SELECT id, number, monthly_rate FROM did_inventory WHERE number = ? AND status = "available" FOR UPDATE',
        [number]
      );
      if (!inv.length) { await conn.rollback(); conn.release(); return res.status(409).json({ error: 'DID no longer available' }); }

      const did        = inv[0];
      const renewal    = new Date(); renewal.setMonth(renewal.getMonth() + 1);
      const renewalStr = renewal.toISOString().split('T')[0];

      /* Check balance */
      const [cust] = await conn.query('SELECT balance FROM customers WHERE id = ? FOR UPDATE', [req.customer.id]);
      if (parseFloat(cust[0].balance) < parseFloat(did.monthly_rate)) {
        await conn.rollback(); conn.release();
        return res.status(402).json({ error: 'Insufficient balance' });
      }

      /* Assign DID */
      const [result] = await conn.query(
        'INSERT INTO did_numbers (number, customer_id, trunk_id, monthly_rate, renewal_date) VALUES (?,?,?,?,?)',
        [number, req.customer.id, trunk_id, did.monthly_rate, renewalStr]
      );
      await conn.query('UPDATE did_inventory SET status = "assigned" WHERE number = ?', [number]);

      /* Deduct balance */
      await conn.query('UPDATE customers SET balance = balance - ? WHERE id = ?', [did.monthly_rate, req.customer.id]);
      await conn.query(
        'INSERT INTO billing_transactions (customer_id, type, amount, balance_before, balance_after, reference_id, description) SELECT ?, "did_charge", -?, balance + ?, balance, ?, ? FROM customers WHERE id = ?',
        [req.customer.id, did.monthly_rate, did.monthly_rate, result.insertId, `DID ${number} first month`, req.customer.id]
      );

      await conn.commit();
      conn.release();
      res.status(201).json({ id: result.insertId, number, trunk_id, renewal_date: renewalStr, monthly_rate: did.monthly_rate });
    } catch (e) {
      await conn.rollback(); conn.release(); throw e;
    }
  } catch (err) { next(err); }
});

/* PATCH /v1/dids/:id — update forward or webhook */
router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const { forward_to, webhook_url } = req.body;
    const [rows] = await db().query(
      'SELECT id FROM did_numbers WHERE id = ? AND customer_id = ? AND status = "active"',
      [req.params.id, req.customer.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'DID not found' });
    await db().query(
      'UPDATE did_numbers SET forward_to = ?, webhook_url = ? WHERE id = ?',
      [forward_to || null, webhook_url || null, req.params.id]
    );
    res.json({ message: 'DID updated' });
  } catch (err) { next(err); }
});

/* DELETE /v1/dids/:id — cancel DID */
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const [rows] = await db().query(
      'SELECT number FROM did_numbers WHERE id = ? AND customer_id = ?',
      [req.params.id, req.customer.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'DID not found' });
    await db().query('UPDATE did_numbers SET status = "cancelled" WHERE id = ?', [req.params.id]);
    await db().query('UPDATE did_inventory SET status = "available" WHERE number = ?', [rows[0].number]);
    res.json({ message: 'DID cancelled' });
  } catch (err) { next(err); }
});

module.exports = router;
