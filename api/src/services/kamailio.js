const { db } = require('../config/db');
const crypto = require('crypto');

/* Provision a new customer trunk in Kamailio DB tables */
async function provisionTrunkInKamailio({ trunkId, customerId, username, password, domain, authType, ipWhitelist, maxChannels }) {
  /* HA1 = MD5(username:domain:password) — Kamailio digest auth */
  const ha1  = crypto.createHash('md5').update(`${username}:${domain}:${password}`).digest('hex');
  const ha1b = crypto.createHash('md5').update(`${username}@${domain}:${domain}:${password}`).digest('hex');

  /* Insert into Kamailio subscriber table */
  await db().query(
    `INSERT INTO subscriber (username, domain, password, ha1, ha1b, customer_id, trunk_id, max_channels, status)
     VALUES (?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE password=?, ha1=?, ha1b=?, max_channels=?, status=?`,
    [username, domain, password, ha1, ha1b, customerId, trunkId, maxChannels, 'active',
     password, ha1, ha1b, maxChannels, 'active']
  );

  /* If IP-auth, add IPs to address table (grp=1) */
  if (authType === 'ip' && ipWhitelist) {
    const ips = ipWhitelist.split(',').map(ip => ip.trim()).filter(Boolean);
    for (const ip of ips) {
      await db().query(
        `INSERT IGNORE INTO address (grp, ip_addr, mask, port, tag, customer_id, trunk_id, max_channels)
         VALUES (1, ?, 32, 0, ?, ?, ?, ?)`,
        [ip, `trunk_${trunkId}`, customerId, trunkId, maxChannels]
      );
    }
  }
}

async function deleteTrunkFromKamailio(trunk) {
  await db().query('DELETE FROM subscriber WHERE trunk_id = ?', [trunk.id]);
  await db().query('DELETE FROM address WHERE trunk_id = ?', [trunk.id]);
}

/*
 * kamailioRpc — call Kamailio's JSON-RPC interface
 * This is the exact mechanism described in guide Section 7.3:
 *   POST http://localhost:5060/RPC
 *   {"jsonrpc":"2.0","method":"uac.request","params":{...},"id":1}
 */
async function kamailioRpc(method, params = {}) {
  const rpcUrl = process.env.KAMAILIO_RPC_URL || 'http://127.0.0.1:5060/RPC';
  const body   = { jsonrpc: '2.0', method, params, id: Date.now() };

  const resp = await fetch(rpcUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!resp.ok) throw new Error(`Kamailio RPC HTTP ${resp.status}`);
  const data = await resp.json();
  if (data.error) throw new Error(`Kamailio RPC error: ${JSON.stringify(data.error)}`);
  return data.result;
}

module.exports = { provisionTrunkInKamailio, deleteTrunkFromKamailio, kamailioRpc };
