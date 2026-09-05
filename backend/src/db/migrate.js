import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pool } from './pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export { runAdminPasswordFix };

export async function runMigrations() {
  // Check if schema already applied
  const { rows } = await pool.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'users'
    ) AS exists
  `);

  if (rows[0].exists) {
    console.log('Database schema already applied, skipping migration.');
    return;
  }

  console.log('Running database schema migration...');
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('Database schema migration complete.');
}

async function runAdminPasswordFix() {
  // One-time fix: update admin password to the correct hash
  const { rows } = await pool.query(
    `SELECT password_hash FROM users WHERE username = 'admin'`
  );
  if (!rows.length) return;
  const correctHash = '$2a$12$RFFb5z/OSlaj65opMmOwXuWQvTkmbZP3BBycSKbH8bXUuXbrry0py';
  if (rows[0].password_hash === correctHash) return;
  await pool.query(
    `UPDATE users SET password_hash = $1 WHERE username = 'admin'`,
    [correctHash]
  );
  console.log('Admin password hash updated.');
}
