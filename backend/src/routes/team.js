import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db/pool.js';
import { rbac } from '../middleware/rbac.js';
import { logEvent } from '../db/events.js';

const router = Router();

// GET /api/team
router.get('/', rbac('partner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, username, role, active, created_at FROM users ORDER BY name'
    );
    res.json({ team: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/team
router.post('/', rbac('partner'), async (req, res) => {
  const { name, username, password, role } = req.body;
  if (!name || !username || !password || !role) {
    return res.status(400).json({ error: 'name, username, password, role required' });
  }
  if (!['partner', 'manager', 'student'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      `INSERT INTO users (name, username, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, username, role, active, created_at`,
      [name, username, hash, role]
    );
    await logEvent({
      by: req.user.name, userId: req.user.sub,
      entity: 'user', entityId: rows[0].id, label: name, type: 'person.added', to: role,
    });
    res.status(201).json({ user: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username already exists' });
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/team/:id
router.patch('/:id', rbac('partner'), async (req, res) => {
  const { name, role, password } = req.body;
  try {
    const { rows: beforeRows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
    const before = beforeRows[0];
    if (!before) return res.status(404).json({ error: 'User not found' });

    const updates = [];
    const values = [];
    let i = 1;

    if (name) { updates.push(`name = $${i++}`); values.push(name); }
    if (role) {
      if (!['partner', 'manager', 'student'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }
      updates.push(`role = $${i++}`); values.push(role);
    }
    if (password) {
      const hash = await bcrypt.hash(password, 12);
      updates.push(`password_hash = $${i++}`); values.push(hash);
    }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });

    updates.push(`updated_at = NOW()`);
    values.push(req.params.id);

    const { rows } = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${i}
       RETURNING id, name, username, role, active, created_at`,
      values
    );
    const after = rows[0];
    if (!after) return res.status(404).json({ error: 'User not found' });
    if (name && after.name !== before.name) {
      await logEvent({
        by: req.user.name, userId: req.user.sub,
        entity: 'user', entityId: after.id, type: 'person.renamed', from: before.name, to: after.name,
      });
    }
    if (role && after.role !== before.role) {
      await logEvent({
        by: req.user.name, userId: req.user.sub,
        entity: 'user', entityId: after.id, label: after.name, type: 'person.role', from: before.role, to: after.role,
      });
    }
    res.json({ user: after });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/team/:id  — deactivates, does not hard-delete
router.delete('/:id', rbac('partner'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE users SET active = false, updated_at = NOW()
       WHERE id = $1 RETURNING id, name`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    await logEvent({
      by: req.user.name, userId: req.user.sub,
      entity: 'user', entityId: rows[0].id, label: rows[0].name, type: 'person.removed',
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
