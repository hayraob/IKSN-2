const fs = require('fs');
const path = require('path');
const { pool } = require('./index');

(async () => {
  if (!pool) throw new Error('DATABASE_URL is required for migrations.');
  const sql = fs.readFileSync(path.join(process.cwd(), 'migrations', '001_init.sql'), 'utf8');
  await pool.query(sql);
  await pool.end();
  console.log('Migration complete.');
})().catch(err => { console.error(err); process.exit(1); });
