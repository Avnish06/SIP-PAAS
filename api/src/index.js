const http     = require('http');
const net      = require('net');
const tls      = require('tls');
const express  = require('express');
const helmet   = require('helmet');
const cors     = require('cors');
const morgan   = require('morgan');
const rateLimit = require('express-rate-limit');

const { initDB }    = require('./config/db');
const { initRedis } = require('./config/redis');
const logger        = require('./config/logger');

const authRoutes     = require('./routes/auth');
const accountRoutes  = require('./routes/accounts');
const trunkRoutes    = require('./routes/trunks');
const didRoutes      = require('./routes/dids');
const callRoutes     = require('./routes/calls');
const billingRoutes  = require('./routes/billing');
const webhookRoutes  = require('./routes/webhooks');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('combined', { stream: { write: m => logger.info(m.trim()) } }));

/* Global rate limit */
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));

/* Routes */
app.use('/v1/auth',     authRoutes);
app.use('/v1/accounts', accountRoutes);
app.use('/v1/trunks',   trunkRoutes);
app.use('/v1/dids',     didRoutes);
app.use('/v1/calls',    callRoutes);
app.use('/v1/billing',  billingRoutes);
app.use('/v1/webhooks', webhookRoutes);

/* Health check */
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date() }));

/* Error handler */
app.use((err, req, res, next) => {
  logger.error(err.stack);
  const status = err.status || 500;
  res.status(status).json({ status: 'error', error: { code: err.code || 'SERVER_ERROR', message: err.message } });
});

async function start() {
  await initDB();
  await initRedis();
  const port = process.env.PORT || 3000;

  // Create HTTP server so we can intercept WebSocket upgrades
  const server = http.createServer(app);

  // ── WebSocket proxy: /sip-ws → Asterisk ws://host:8088/ws (plain TCP) ──
  // ── WebSocket proxy: /vocallabs-ws → wss://call.vocallabs.ai (TLS)    ──
  const VOCALLABS_WS_HOST = 'call.vocallabs.ai';
  const VOCALLABS_WS_PATH = '/ws/?agent=4e5b4974-fe55-48e9-83a5-1868fa7ac90a_e4c79013-1a87-4a7c-9566-386082863a6f_sip_8000';

  server.on('upgrade', (req, socket, head) => {

    // ── Vocallabs cloud SIP WebSocket proxy ──────────────────────────────
    if (req.url === '/vocallabs-ws') {
      const proxy = tls.connect(443, VOCALLABS_WS_HOST, { servername: VOCALLABS_WS_HOST }, () => {
        const fwdHeaders = Object.entries(req.headers)
          .filter(([k]) => !['host','origin'].includes(k))
          .map(([k, v]) => `${k}: ${v}`)
          .join('\r\n');

        proxy.write(
          `GET ${VOCALLABS_WS_PATH} HTTP/1.1\r\n` +
          `Host: ${VOCALLABS_WS_HOST}\r\n` +
          `Origin: https://${VOCALLABS_WS_HOST}\r\n` +
          fwdHeaders + '\r\n\r\n'
        );
        if (head && head.length) proxy.write(head);
      });

      proxy.pipe(socket);
      socket.pipe(proxy);
      proxy.on('error', (e) => { logger.warn('Vocallabs-WS proxy err: ' + e.message); socket.destroy(); });
      socket.on('error', () => proxy.destroy());
      return;
    }

    // ── Asterisk local SIP WebSocket proxy ───────────────────────────────
    if (req.url !== '/sip-ws') { socket.destroy(); return; }

    const ariUrl  = process.env.ASTERISK_ARI_URL || 'http://172.18.0.1:8088';
    const astHost = new URL(ariUrl).hostname;
    const astPort = 8088;

    const proxy = net.connect(astPort, astHost, () => {
      const fwdHeaders = Object.entries(req.headers)
        .filter(([k]) => k !== 'host')
        .map(([k, v]) => `${k}: ${v}`)
        .join('\r\n');

      proxy.write(
        `GET /ws HTTP/1.1\r\n` +
        `Host: ${astHost}:${astPort}\r\n` +
        fwdHeaders + '\r\n\r\n'
      );
      if (head && head.length) proxy.write(head);
    });

    proxy.pipe(socket);
    socket.pipe(proxy);
    proxy.on('error', (e) => { logger.warn('SIP-WS proxy err: ' + e.message); socket.destroy(); });
    socket.on('error', () => proxy.destroy());
  });

  server.listen(port, () => logger.info(`SIPaaS API listening on :${port} (WS proxies: /sip-ws /vocallabs-ws)`));
}

start().catch(err => { logger.error('Startup failed:', err); process.exit(1); });
