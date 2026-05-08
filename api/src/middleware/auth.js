const jwt    = require('jsonwebtoken');
const { db } = require('../config/db');

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) return res.status(401).json({ error: 'Missing token' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const [rows]  = await db().query(
      'SELECT id, email, name, status, balance FROM customers WHERE id = ? AND status = "active"',
      [payload.sub]
    );
    if (!rows.length) return res.status(401).json({ error: 'Account not found or suspended' });
    req.customer = rows[0];
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/* API key auth (for SIP callbacks & machine-to-machine) */
async function requireApiKey(req, res, next) {
  const apiKey    = req.headers['x-api-key'];
  const apiSecret = req.headers['x-api-secret'];
  if (!apiKey) return res.status(401).json({ error: 'Missing API key' });

  const [rows] = await db().query(
    'SELECT id, email, name, status, balance FROM customers WHERE api_key = ? AND api_secret = ? AND status = "active"',
    [apiKey, apiSecret]
  );
  if (!rows.length) return res.status(401).json({ error: 'Invalid API credentials' });
  req.customer = rows[0];
  next();
}

module.exports = { requireAuth, requireApiKey };
