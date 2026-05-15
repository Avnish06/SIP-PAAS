/*
 * Billing Engine
 * 1. AMI CDR listener — writes CDR to DB on every call end (real-time)
 * 2. processCDRs()   — bills unbilled answered CDRs every 60s
 * 3. processDIDs()   — monthly DID renewals every hour
 * 4. syncBalances()  — syncs Redis on startup
 */

const mysql  = require('mysql2/promise');
const redis  = require('redis');
const net    = require('net');

const RATE_PER_MIN = parseFloat(process.env.RATE_PER_MIN || '0.45');
const DID_RATE     = parseFloat(process.env.DID_MONTHLY_RATE || '500');

const AMI_HOST = process.env.ASTERISK_AMI_HOST || 'host.docker.internal';
const AMI_PORT = parseInt(process.env.ASTERISK_AMI_PORT || '5038');
const AMI_USER = process.env.ASTERISK_AMI_USER || 'amiuser';
const AMI_PASS = process.env.ASTERISK_AMI_PASS || 'AmiPassword!';

let db, cache;

/* ── DB init ───────────────────────────────────────────────── */
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

/* ── Parse AMI date string → MySQL datetime ────────────────── */
function parseAmiDate(str) {
  if (!str || str.trim() === '') return null;
  // Format: "2026-05-12 14:30:05"
  return str.trim().replace('T', ' ').split('.')[0];
}

/* ── Parse raw AMI block into key-value object ─────────────── */
function parseAmiEvent(raw) {
  const obj = {};
  for (const line of raw.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    obj[key] = val;
  }
  return obj;
}

/* ── Write CDR event from AMI to DB ────────────────────────── */
async function handleCdrEvent(ev) {
  try {
    const customerId = parseInt(ev.AccountCode) || null;
    const trunkId    = parseInt(ev.UserField)    || null;
    const billsec    = parseInt(ev.BillableSeconds) || 0;
    const duration   = parseInt(ev.Duration)        || 0;

    const startTime  = parseAmiDate(ev.StartTime);
    const answerTime = parseAmiDate(ev.AnswerTime);
    const endTime    = parseAmiDate(ev.EndTime);

    // Deduplicate by uniqueid
    const [exists] = await db.query('SELECT id FROM cdr WHERE uniqueid = ?', [ev.UniqueID]);
    if (exists.length) return;

    await db.query(
      `INSERT INTO cdr
         (callid, customer_id, trunk_id, src, dst, dcontext, clid,
          channel, dstchannel, lastapp, lastdata,
          start_time, answer_time, end_time,
          duration, billsec, disposition, amaflags,
          accountcode, uniqueid, userfield, direction, billed)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`,
      [
        ev.UniqueID,
        customerId,
        trunkId,
        ev.Source         || '',
        ev.Destination    || '',
        ev.DestinationContext || '',
        ev.CallerID       || '',
        ev.Channel        || '',
        ev.DestinationChannel || '',
        ev.LastApplication || '',
        ev.LastData       || '',
        startTime,
        answerTime,
        endTime,
        duration,
        billsec,
        ev.Disposition    || 'NO ANSWER',
        0,
        ev.AccountCode    || '',
        ev.UniqueID,
        ev.UserField      || '',
        'outbound',
      ]
    );
    console.log(`CDR saved: ${ev.Source} → ${ev.Destination} ${billsec}s [${ev.Disposition}]`);
  } catch (e) {
    console.error('CDR insert error:', e.message);
  }
}

/* ── AMI CDR listener (persistent connection) ──────────────── */
function startAmiListener() {
  const sock = net.connect(AMI_PORT, AMI_HOST);
  let buf = '';
  let loggedIn = false;

  sock.on('connect', () => {
    console.log(`AMI connected to ${AMI_HOST}:${AMI_PORT}`);
  });

  sock.on('data', chunk => {
    buf += chunk.toString();
    // AMI events are separated by \r\n\r\n
    const parts = buf.split('\r\n\r\n');
    buf = parts.pop();

    for (const part of parts) {
      if (!part.trim()) continue;
      const ev = parseAmiEvent(part);

      // Login response
      if (!loggedIn && ev.Response === 'Success') {
        loggedIn = true;
        console.log('AMI authenticated — listening for CDR events');
      }

      // CDR event — save to DB
      if (ev.Event === 'Cdr') {
        handleCdrEvent(ev);
      }
    }
  });

  sock.on('error', e => {
    console.error(`AMI error: ${e.message} — retrying in 15s`);
  });

  sock.on('close', () => {
    console.log('AMI disconnected — reconnecting in 15s');
    loggedIn = false;
    setTimeout(startAmiListener, 15000);
  });

  sock.setTimeout(0); // no timeout — keep alive

  // Login and subscribe to CDR events only
  sock.write(
    `Action: Login\r\nUsername: ${AMI_USER}\r\nSecret: ${AMI_PASS}\r\nEvents: cdr\r\n\r\n`
  );
}

/* ── Bill unbilled CDRs (cost calculation) ─────────────────── */
async function processCDRs() {
  const [cdrs] = await db.query(
    'SELECT * FROM cdr WHERE billed = 0 AND disposition = "ANSWERED" AND billsec > 0 LIMIT 500'
  );
  if (!cdrs.length) return;

  for (const cdr of cdrs) {
    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      const [rates] = await conn.query(
        `SELECT rate_per_min FROM rate_cards
         WHERE (customer_id = ? OR customer_id IS NULL) AND ? LIKE CONCAT(prefix, '%') AND active = 1
         ORDER BY CHAR_LENGTH(prefix) DESC, customer_id DESC LIMIT 1`,
        [cdr.customer_id, cdr.dst]
      );
      const rate = rates.length ? parseFloat(rates[0].rate_per_min) : RATE_PER_MIN;
      const cost = (Math.ceil(cdr.billsec / 60) * rate).toFixed(4);

      await conn.query('UPDATE cdr SET cost = ?, rate = ?, billed = 1 WHERE id = ?', [cost, rate, cdr.id]);
      if (cdr.customer_id) {
        await conn.query('UPDATE customers SET balance = GREATEST(0, balance - ?) WHERE id = ?', [cost, cdr.customer_id]);
        await conn.query(
          `INSERT INTO billing_transactions
             (customer_id, type, amount, balance_before, balance_after, reference_id, description)
           SELECT ?, 'call_charge', -?, balance + ?, balance, ?, ?
           FROM customers WHERE id = ?`,
          [cdr.customer_id, cost, cost, cdr.callid, `Call ${cdr.src}→${cdr.dst} ${cdr.billsec}s`, cdr.customer_id]
        );
        const [row] = await db.query('SELECT balance FROM customers WHERE id = ?', [cdr.customer_id]);
        if (row.length) await cache.set(`sipaas:balance:${cdr.customer_id}`, row[0].balance.toString());
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      console.error(`CDR ${cdr.id} billing error:`, e.message);
    } finally { conn.release(); }
  }
  console.log(`Billed ${cdrs.length} CDRs`);
}

/* ── DID monthly renewals ──────────────────────────────────── */
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
        await conn.query('UPDATE did_numbers SET status = "suspended" WHERE id = ?', [did.id]);
        console.warn(`DID ${did.number} suspended — insufficient balance`);
      } else {
        const renewal = new Date(did.renewal_date);
        renewal.setMonth(renewal.getMonth() + 1);
        await conn.query('UPDATE did_numbers SET renewal_date = ? WHERE id = ?', [renewal.toISOString().split('T')[0], did.id]);
        await conn.query('UPDATE customers SET balance = balance - ? WHERE id = ?', [did.monthly_rate, did.customer_id]);
        await conn.query(
          'INSERT INTO billing_transactions (customer_id, type, amount, balance_before, balance_after, reference_id, description) VALUES (?,?,?,?,?,?,?)',
          [did.customer_id, 'did_charge', -did.monthly_rate, did.balance, did.balance - did.monthly_rate, did.id, `DID ${did.number} monthly renewal`]
        );
        await cache.set(`sipaas:balance:${did.customer_id}`, (parseFloat(did.balance) - did.monthly_rate).toString());
      }
      await conn.commit();
    } catch (e) { await conn.rollback(); console.error(`DID renewal ${did.id}:`, e.message); }
    finally { conn.release(); }
  }
  if (dids.length) console.log(`Processed ${dids.length} DID renewals`);
}

/* ── Sync all balances to Redis on startup ─────────────────── */
async function syncAllBalances() {
  const [rows] = await db.query('SELECT id, balance FROM customers WHERE status = "active"');
  for (const r of rows) await cache.set(`sipaas:balance:${r.id}`, r.balance.toString());
  console.log(`Synced ${rows.length} balances to Redis`);
}

/* ── Main ──────────────────────────────────────────────────── */
async function run() {
  await init();
  await syncAllBalances();

  // Start AMI CDR listener (real-time CDR capture)
  startAmiListener();

  // Bill CDRs every 60s
  setInterval(async () => {
    try { await processCDRs(); } catch (e) { console.error('CDR loop:', e.message); }
  }, 60_000);

  // DID renewals every hour
  setInterval(async () => {
    try { await processDIDRenewals(); } catch (e) { console.error('DID loop:', e.message); }
  }, 3_600_000);

  // Initial run
  await processCDRs();
  await processDIDRenewals();
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
