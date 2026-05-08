const { v4: uuid } = require('uuid');

/* Originate outbound call via Asterisk ARI */
async function originateCall({ from, to, trunk, customerId }) {
  const ariUrl  = process.env.ASTERISK_ARI_URL || 'http://127.0.0.1:8088';
  const ariUser = process.env.ASTERISK_ARI_USER || 'ariuser';
  const ariPass = process.env.ASTERISK_ARI_PASS || '';
  const callId  = uuid();

  const body = {
    endpoint:    `PJSIP/${to}@tata-trunk`,
    callerId:    from,
    timeout:     30,
    context:     'outbound',
    extension:   to,
    priority:    1,
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

module.exports = { originateCall };
