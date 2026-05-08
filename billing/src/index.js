/*
 * Billing Engine — runs every 60 seconds
 * Processes unbilled CDRs, deducts customer balances,
 * handles DID monthly renewals, syncs Redis balances.
 */

const mysql  = require('mysql2/promise');
const redis  = require('redis');

const RATE_PER_MIN = parseFloat(process.env.RATE_PER_MIN || '0.45');
const DID_RATE     = parseFloat(process.env.DID_MONTHLY_RATE || '500');

let db, cache;

async function init() {
  db = await mysql.createPool({
    host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER, password: process.env.DB_PASS,
    database: process.env.DB_NAME || 'kamailio', connectionLimit: 5,
  });
  cache = redis.createClient({
    socket: { host: process.env.REDIS_HOST, port: parseInt(process.env.REDIS_PORT || '6379') },
    password: process.env.REDIS_PASS,
  });
  cache.on('error', e => console.error('Redis:', e));
  await cache.connect();
  console.log('Billing engine started');
}

/* Process unbilled CDRs */
async function processCDRs() {
  const [cdrs] = await db.query(
    'SELECT * FROM cdr WHERE billed = 0 AND disposition = "ANSWERED" AND billsec > 0 LIMIT 500'
  );
  if (!cdrs.length) return;

  for (const cdr of cdrs) {
    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      /* Lookup rate */
      const [rates] = await conn.query(
        `SELECT rate_per_min FROM rate_cards
         WHERE (customer_id = ? OR customer_id IS NULL) AND ? LIKE CONCAT(prefix, '%') AND active = 1
         ORDER BY CHAR_LENGTH(prefix) DESC, customer_id DESC LIMIT 1`,
        [cdr.customer_id, cdr.dst]
      );
      const rate = rates.length ? parseFloat(rates[0].rate_per_min) : RATE_PER_MIN;
      const cost = Math.ceil(cdr.billsec / 60) * rate / (60 / 60);   // per 60s increment

      await conn.query('UPDATE cdr SET cost = ?, rate = ?, billed = 1 WHERE id = ?', [cost.toFixed(4), rate, cdr.id]);
      await conn.query('UPDATE customers SET balance = GREATEST(0, balance - ?) WHERE id = ?', [cost, cdr.customer_id]);
      await conn.query(
        'INSERT INTO billing_transactions (customer_id, type, amount, balance_before, balance_after, reference_id, description) SELECT ?, "call_charge", -?, balance + ?, balance, ?, ? FROM customers WHERE id = ?',
        [cdr.customer_id, cost, cost, cdr.callid, `Call ${cdr.src}→${cdr.dst} ${cdr.billsec}s`, cdr.customer_id]
      );
      await conn.commit();

      /* Sync Redis balance */
      const [row] = await db.query('SELECT balance FROM customers WHERE id = ?', [cdr.customer_id]);
      if (row.length) await cache.set(`sipaas:balance:${cdr.customer_id}`, row[0].balance.toString());
    } catch (e) {
      await conn.rollback();
      console.error(`CDR ${cdr.id} billing error:`, e.message);
    } finally { conn.release(); }
  }
  console.log(`Billed ${cdrs.length} CDRs`);
}

/* Renew DID monthly charges */
async function processDIDRenewals() {
  const today = new Date().toISOString().split('T')[0];
  const [dids] = await db.query(
    'SELECT d.*, c.balance FROM did_numbers d JOIN customers c ON c.id = d.customer_id WHERE d.renewal_date <= ? AND d.status = "active"',
    [today]
  );

  for (const did of dids) {
    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      if (parseFloat(did.balance) < did.monthly_rate) {
        /* Suspend DID if balance is too low */
        await conn.query('UPDATE did_numbers SET status = "suspended" WHERE id = ?', [did.id]);
        console.warn(`DID ${did.number} suspended — insufficient balance`);
      } else {
        const renewal = new Date(did.renewal_date);
        renewal.setMonth(renewal.getMonth() + 1);
        await conn.query('UPDATE did_numbers SET renewal_date = ? WHERE id = ?', [renewal.toISOString().split('T')[0], did.id]);
        await conn.query('UPDATE customers SET balance = balance - ? WHERE id = ?', [did.monthly_rate, did.customer_id]);
        await conn.query(
          'INSERT INTO billing_transactions (customer_id, type, amount, balance_before, balance_after, reference_id, description) VALUES (?,?,?,?,?,?,?)',
          [did.customer_id, 'did_charge', -did.monthly_rate,
           did.balance, did.balance - did.monthly_rate, did.id, `DID ${did.number} monthly renewal`]
        );
        await cache.set(`sipaas:balance:${did.customer_id}`, (parseFloat(did.balance) - did.monthly_rate).toString());
      }
      await conn.commit();
    } catch (e) { await conn.rollback(); console.error(`DID renewal ${did.id}:`, e.message); }
    finally { conn.release(); }
  }
  if (dids.length) console.log(`Processed ${dids.length} DID renewals`);
}

/* Sync all customer balances to Redis (on startup) */
async function syncAllBalances() {
  const [rows] = await db.query('SELECT id, balance FROM customers WHERE status = "active"');
  for (const r of rows) {
    await cache.set(`sipaas:balance:${r.id}`, r.balance.toString());
  }
  console.log(`Synced ${rows.length} balances to Redis`);
}

async function run() {
  await init();
  await syncAllBalances();

  /* Run billing loop every 60s */
  setInterval(async () => {
    try { await processCDRs(); } catch (e) { console.error('CDR loop:', e.message); }
  }, 60_000);

  /* Run DID renewals every hour */
  setInterval(async () => {
    try { await processDIDRenewals(); } catch (e) { console.error('DID loop:', e.message); }
  }, 3_600_000);

  /* Initial run */
  await processCDRs();
  await processDIDRenewals();
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
