const { createClient } = require('redis');
const logger = require('./logger');

let client;

async function initRedis() {
  client = createClient({
    socket:   { host: process.env.REDIS_HOST || 'localhost', port: parseInt(process.env.REDIS_PORT || '6379') },
    password: process.env.REDIS_PASS,
  });
  client.on('error', e => logger.error('Redis error:', e));
  await client.connect();
  logger.info('Redis connected');
  return client;
}

function redis() {
  if (!client) throw new Error('Redis not initialized');
  return client;
}

module.exports = { initRedis, redis };
