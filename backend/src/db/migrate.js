import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pool } from './pool.js';
import { AUDIT_LIBRARY, defaultIncluded } from './library_seed.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export { runAdminPasswordFix };

export async function runMigrations() {
  // Apply base schema if first run
  const { rows } = await pool.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'users'
    ) AS exists
  `);

  if (!rows[0].exists) {
    console.log('Running database schema migration...');
    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(schema);
    console.log('Database schema migration complete.');
  } else {
    console.log('Database schema already applied, skipping base migration.');
  }

  // Idempotent: create library tables if missing
  await pool.query(`
    CREATE TABLE IF NOT EXISTS library_heads (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      module TEXT NOT NULL,
      head_id TEXT NOT NULL,
      section TEXT NOT NULL,
      sub TEXT NOT NULL,
      sort_order INT DEFAULT 0,
      UNIQUE(module, head_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS library_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      head_id_fk UUID REFERENCES library_heads ON DELETE CASCADE,
      ref TEXT NOT NULL DEFAULT '',
      p TEXT NOT NULL DEFAULT '',
      req BOOLEAN NOT NULL DEFAULT true,
      sort_order INT DEFAULT 0
    )
  `);

  // Seed audit library if empty
  const { rows: existing } = await pool.query(
    `SELECT COUNT(*) AS cnt FROM library_heads WHERE module = 'audit'`
  );
  if (parseInt(existing[0].cnt) === 0) {
    console.log('Seeding audit library...');
    await seedAuditLibrary();
    console.log('Audit library seeded.');
  }
}

async function seedAuditLibrary() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let hi = 0; hi < AUDIT_LIBRARY.length; hi++) {
      const head = AUDIT_LIBRARY[hi];
      const { rows: [h] } = await client.query(
        `INSERT INTO library_heads (module, head_id, section, sub, sort_order)
         VALUES ('audit', $1, $2, $3, $4) RETURNING id`,
        [head.id, head.section, head.sub, hi]
      );
      for (let ii = 0; ii < head.items.length; ii++) {
        const it = head.items[ii];
        await client.query(
          `INSERT INTO library_items (head_id_fk, ref, p, req, sort_order) VALUES ($1, $2, $3, $4, $5)`,
          [h.id, it.ref, it.p, it.req, ii]
        );
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function runAdminPasswordFix() {
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
