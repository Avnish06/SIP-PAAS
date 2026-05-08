const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');
const morgan  = require('morgan');
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
  app.listen(port, () => logger.info(`SIPaaS API listening on :${port}`));
}

start().catch(err => { logger.error('Startup failed:', err); process.exit(1); });
