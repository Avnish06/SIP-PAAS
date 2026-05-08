const mysql  = require('mysql2/promise');
const logger = require('./logger');

let pool;

async function initDB() {
  pool = mysql.createPool({
    host:            process.env.DB_HOST || 'localhost',
    port:            parseInt(process.env.DB_PORT || '3306'),
    user:            process.env.DB_USER,
    password:        process.env.DB_PASS,
    database:        process.env.DB_NAME || 'kamailio',
    connectionLimit: 20,
    waitForConnections: true,
    queueLimit:      0,
    charset:         'utf8mb4',
  });
  await pool.query('SELECT 1');
  logger.info('MySQL connected');
  return pool;
}

function db() {
  if (!pool) throw new Error('DB not initialized');
  return pool;
}

module.exports = { initDB, db };
