const { Pool } = require('pg');
const config = require('../config/env');

const pool = config.databaseUrl
  ? new Pool({ connectionString: config.databaseUrl, max: 10, ssl: config.isProduction ? { rejectUnauthorized: false } : undefined })
  : null;

async function query(text, params = []) {
  if (!pool) throw new Error('DATABASE_URL is not configured');
  return pool.query(text, params);
}

async function withTransaction(fn) {
  if (!pool) return fn(null);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
