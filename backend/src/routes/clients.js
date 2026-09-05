import { Router } from 'express';
import { pool } from '../db/pool.js';
import { rbac } from '../middleware/rbac.js';
import { logEvent } from '../db/events.js';

const router = Router();

// GET /api/clients
router.get('/', async (req, res) => {
  try {
    const { module } = req.query;
    const values = [];
    let where = '';
    if (module) {
      where = 'WHERE module = $1';
      values.push(module);
    }
    const { rows } = await pool.query(
      `SELECT id, module, name, ntn, contact_name, phone, is_firm, created_at, updated_at
       FROM clients ${where} ORDER BY name`,
      values
    );
    res.json({ clients: rows.map(toClient) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/clients/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM clients WHERE id = $1',
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Client not found' });
    res.json({ client: toClient(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/clients
router.post('/', rbac('partner', 'manager'), async (req, res) => {
  const { module, name, ntn = '', contactName = '', phone = '', isFirm = false } = req.body;
  if (!module || !name) return res.status(400).json({ error: 'module and name required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO clients (module, name, ntn, contact_name, phone, is_firm)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [module, name, ntn, contactName, phone, isFirm]
    );
    await logEvent({
      by: req.user.name, userId: req.user.sub, module, clientId: rows[0].id,
      entity: 'client', entityId: rows[0].id, label: name, type: 'client.added',
    });
    res.status(201).json({ client: toClient(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/clients/:id
router.patch('/:id', rbac('partner', 'manager'), async (req, res) => {
  const { name, ntn, contactName, phone, module } = req.body;
  try {
    const { rows: beforeRows } = await pool.query('SELECT * FROM clients WHERE id = $1', [req.params.id]);
    const before = beforeRows[0];
    if (!before) return res.status(404).json({ error: 'Client not found' });

    const updates = [];
    const values = [];
    let i = 1;

    if (name !== undefined)        { updates.push(`name = $${i++}`);         values.push(name); }
    if (ntn !== undefined)         { updates.push(`ntn = $${i++}`);          values.push(ntn); }
    if (contactName !== undefined) { updates.push(`contact_name = $${i++}`); values.push(contactName); }
    if (phone !== undefined)       { updates.push(`phone = $${i++}`);        values.push(phone); }
    if (module !== undefined)      { updates.push(`module = $${i++}`);       values.push(module); }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });

    updates.push('updated_at = NOW()');
    values.push(req.params.id);

    const { rows } = await pool.query(
      `UPDATE clients SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    const after = rows[0];
    if (!after) return res.status(404).json({ error: 'Client not found' });
    if (name !== undefined && after.name !== before.name) {
      await logEvent({
        by: req.user.name, userId: req.user.sub, module: after.module, clientId: after.id,
        entity: 'client', entityId: after.id, type: 'client.renamed', from: before.name, to: after.name,
      });
    }
    res.json({ client: toClient(after) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/clients/:id
router.delete('/:id', rbac('partner', 'manager'), async (req, res) => {
  try {
    const { rows: beforeRows } = await pool.query('SELECT * FROM clients WHERE id = $1', [req.params.id]);
    const before = beforeRows[0];
    const { rows } = await pool.query(
      'DELETE FROM clients WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Client not found' });
    if (before) {
      await logEvent({
        by: req.user.name, userId: req.user.sub, module: before.module,
        entity: 'client', entityId: before.id, label: before.name, type: 'client.removed',
      });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function toClient(row) {
  return {
    id: row.id,
    module: row.module,
    name: row.name,
    ntn: row.ntn,
    contactName: row.contact_name,
    phone: row.phone,
    isFirm: row.is_firm,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export default router;
