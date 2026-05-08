const router   = require('express').Router();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const { db }   = require('../config/db');

/* POST /v1/auth/register */
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, name, company, phone } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: 'email, password, name required' });

    const hash      = await bcrypt.hash(password, 12);
    const apiKey    = uuid().replace(/-/g, '');
    const apiSecret = uuid().replace(/-/g, '') + uuid().replace(/-/g, '');

    const [result] = await db().query(
      'INSERT INTO customers (email, password_hash, name, company, phone, api_key, api_secret, status) VALUES (?,?,?,?,?,?,?,?)',
      [email, hash, name, company || null, phone || null, apiKey, apiSecret, 'active']
    );

    res.status(201).json({
      id:         result.insertId,
      email,
      name,
      api_key:    apiKey,
      api_secret: apiSecret,
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Email already registered' });
    next(err);
  }
});

/* POST /v1/auth/login */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const [rows] = await db().query('SELECT * FROM customers WHERE email = ?', [email]);
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });

    const customer = rows[0];
    const valid    = await bcrypt.compare(password, customer.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    if (customer.status !== 'active') return res.status(403).json({ error: 'Account suspended' });

    const token = jwt.sign({ sub: customer.id }, process.env.JWT_SECRET, { expiresIn: '24h' });

    res.json({
      token,
      customer: { id: customer.id, email: customer.email, name: customer.name, balance: customer.balance },
    });
  } catch (err) { next(err); }
});

module.exports = router;
