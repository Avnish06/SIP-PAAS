const router = require('express').Router();
const crypto = require('crypto');
const { db } = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { provisionTrunkInKamailio, deleteTrunkFromKamailio } = require('../services/kamailio');

/* GET /v1/trunks — list customer trunks */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const [rows] = await db().query(
      'SELECT id, name, sip_username, sip_domain, auth_type, ip_whitelist, max_channels, status, monthly_rate, created_at FROM trunks WHERE customer_id = ? AND status != "deleted"',
      [req.customer.id]
    );
    res.json({ trunks: rows });
  } catch (err) { next(err); }
});

/* POST /v1/trunks — create (buy) a new trunk */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { name, auth_type = 'digest', ip_whitelist, max_channels = 2 } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });

    const domain    = process.env.DOMAIN;
    const username  = `c${req.customer.id}_${Date.now()}`;
    const password  = crypto.randomBytes(16).toString('hex');

    const [result] = await db().query(
      `INSERT INTO trunks (customer_id, name, sip_username, sip_password, sip_domain, auth_type, ip_whitelist, max_channels)
       VALUES (?,?,?,?,?,?,?,?)`,
      [req.customer.id, name, username, password, domain, auth_type, ip_whitelist || null, max_channels]
    );
    const trunkId = result.insertId;

    /* Provision in Kamailio: add subscriber row + address row */
    await provisionTrunkInKamailio({
      trunkId,
      customerId: req.customer.id,
      username,
      password,
      domain,
      authType:    auth_type,
      ipWhitelist: ip_whitelist,
      maxChannels: max_channels,
    });

    res.status(201).json({
      id:           trunkId,
      sip_username: username,
      sip_password: password,
      sip_domain:   domain,
      sip_server:   domain,
      sip_port:     5060,
      auth_type,
      max_channels,
    });
  } catch (err) { next(err); }
});

/* DELETE /v1/trunks/:id — remove trunk */
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const [rows] = await db().query(
      'SELECT * FROM trunks WHERE id = ? AND customer_id = ?',
      [req.params.id, req.customer.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Trunk not found' });

    await deleteTrunkFromKamailio(rows[0]);
    await db().query('UPDATE trunks SET status = "deleted" WHERE id = ?', [req.params.id]);

    res.json({ message: 'Trunk deleted' });
  } catch (err) { next(err); }
});

/* PATCH /v1/trunks/:id — update trunk settings */
router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const allowed = ['name', 'ip_whitelist', 'max_channels'];
    const updates = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
    if (!Object.keys(updates).length) return res.status(400).json({ error: 'No valid fields to update' });

    const [rows] = await db().query(
      'SELECT id FROM trunks WHERE id = ? AND customer_id = ? AND status = "active"',
      [req.params.id, req.customer.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Trunk not found' });

    const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    await db().query(`UPDATE trunks SET ${setClause} WHERE id = ?`, [...Object.values(updates), req.params.id]);

    /* Sync max_channels to Kamailio subscriber + address tables */
    if (updates.max_channels) {
      await db().query(
        'UPDATE subscriber SET max_channels = ? WHERE trunk_id = ?',
        [updates.max_channels, req.params.id]
      );
      await db().query(
        'UPDATE address SET max_channels = ? WHERE trunk_id = ?',
        [updates.max_channels, req.params.id]
      );
    }

    res.json({ message: 'Trunk updated' });
  } catch (err) { next(err); }
});

module.exports = router;
