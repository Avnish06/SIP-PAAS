const { v4: uuid } = require('uuid');
const net          = require('net');

/* ── helper: normalize any Indian number to 10-digit ─────── */
function toTenDigit(num) {
  let n = num.replace(/^\+/, '');           // strip leading +
  if (n.startsWith('91') && n.length === 12) n = n.slice(2);   // 919142436879 → 9142436879
  else if (n.startsWith('0') && n.length === 11) n = n.slice(1); // 09142436879 → 9142436879
  return n;
}

/* ── Originate outbound call via Asterisk ARI ─────────────── */
async function originateCall({ from, to, trunk, customerId }) {
  const ariUrl  = process.env.ASTERISK_ARI_URL || 'http://127.0.0.1:8088';
  const ariUser = process.env.ASTERISK_ARI_USER || 'ariuser';
  const ariPass = process.env.ASTERISK_ARI_PASS || '';
  const callId  = uuid();

  const prefix   = process.env.SYNCHROVOX_PREFIX || process.env.VOCALLABS_PREFIX || '';
  const trunk_ep = process.env.SYNCHROVOX_IP ? 'synchrovox-trunk' : 'vocallabs-trunk';
  const callerId = process.env.SYNCHROVOX_CALLER_ID || process.env.VOCALLABS_CALLER_ID || from;

  const tenDigit = toTenDigit(to);
  const dnis     = prefix ? `${prefix}${tenDigit}` : tenDigit;

  const body = {
    endpoint:  `PJSIP/${dnis}@${trunk_ep}`,
    callerId:  callerId,
    timeout:   30,
    context:   'from-ari',
    extension: dnis,
    priority:  1,
    variables: {
      CUSTOMER_ID: String(customerId),
      TRUNK_ID:    String(trunk.id),
    },
  };

  const resp = await fetch(`${ariUrl}/ari/channels`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': 'Basic ' + Buffer.from(`${ariUser}:${ariPass}`).toString('base64'),
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw Object.assign(new Error(`ARI originate failed: ${text}`), { status: 502 });
  }
  const data = await resp.json();
  return data.id || callId;
}

/* ── Bridge call via Asterisk AMI ────────────────────────────
 *  Calls `myNumber` first. When answered, bridges to `toNumber`.
 *  Both parties hear each other — no softphone needed.
 * ────────────────────────────────────────────────────────── */
function amiCommand(commands) {
  return new Promise((resolve, reject) => {
    const host   = process.env.ASTERISK_AMI_HOST || 'host.docker.internal';
    const port   = parseInt(process.env.ASTERISK_AMI_PORT || '5038');
    const user   = process.env.ASTERISK_AMI_USER || 'amiuser';
    const secret = process.env.ASTERISK_AMI_PASS || '';

    const sock = net.connect(port, host);
    let buf  = '';
    let done = false;

    const finish = (err, result) => {
      if (done) return;
      done = true;
      sock.destroy();
      err ? reject(err) : resolve(result);
    };

    sock.setTimeout(10000);
    sock.on('timeout', () => finish(Object.assign(new Error('AMI timeout — Asterisk not reachable'), { status: 503 })));
    sock.on('error',   (e) => {
      const msg = e.code === 'ENOTFOUND' || e.code === 'EAI_AGAIN'
        ? `Asterisk not running (cannot resolve host: ${host})`
        : e.code === 'ECONNREFUSED'
        ? `Asterisk not running (connection refused on ${host}:${port})`
        : `AMI connection failed: ${e.message}`;
      finish(Object.assign(new Error(msg), { status: 503 }));
    });

    sock.on('data', (chunk) => {
      buf += chunk.toString();
      // After login succeeds, send each command in sequence
      if (!sock._logged && buf.includes('Response: Success')) {
        sock._logged = true;
        buf = '';
        for (const cmd of commands) {
          sock.write(cmd + '\r\n');
        }
      }
      // After all commands sent, look for final Response
      if (sock._logged && buf.includes('Response: Success')) {
        finish(null, buf);
      }
      if (buf.includes('Response: Error')) {
        finish(new Error('AMI error: ' + buf));
      }
    });

    // Login
    sock.write(
      `Action: Login\r\nUsername: ${user}\r\nSecret: ${secret}\r\n\r\n`
    );
  });
}

async function bridgeCall({ myNumber, toNumber, customerId }) {
  const prefix   = process.env.SYNCHROVOX_PREFIX || '0';
  const callerId = process.env.SYNCHROVOX_CALLER_ID || '00919240292847';
  const trunk_ep = 'synchrovox-trunk';

  const myDnis   = prefix + toTenDigit(myNumber);   // e.g. 09876543210
  const destDnis = prefix + toTenDigit(toNumber);   // e.g. 09142436879

  // Route through the [click-to-call] dialplan context (extensions.conf)
  // instead of running Dial directly via Application/Data. The dialplan
  // sets CDR(accountcode)=${CUSTOMER_ID} from the variable below — that's
  // the only fully reliable way to attribute CDRs to a customer on AMI
  // Originate. Account: <id> alone does not propagate to the CDR row.
  const actionId = uuid();
  const cmd = [
    `Action: Originate`,
    `ActionID: ${actionId}`,
    `Channel: PJSIP/${myDnis}@${trunk_ep}`,
    `Context: click-to-call`,
    `Exten: ${destDnis}`,
    `Priority: 1`,
    `CallerID: ${callerId}`,
    `Timeout: 30000`,
    `Async: yes`,
    `Account: ${customerId}`,
    `Variable: CUSTOMER_ID=${customerId}`,
    ``,
  ].join('\r\n');

  await amiCommand([cmd]);
  return { my_dnis: myDnis, dest_dnis: destDnis, action_id: actionId };
}

module.exports = { originateCall, bridgeCall };
