import { Router } from 'express';
import { pool } from '../db/pool.js';
import { rbac } from '../middleware/rbac.js';

const router = Router();

function toItem(row) {
  return {
    id: row.id,
    engagementId: row.engagement_id,
    ref: row.ref,
    section: row.section,
    headId: row.head_id,
    sub: row.sub,
    p: row.p,
    kind: row.kind,
    value: row.value,
    requestable: row.requestable,
    headIncluded: row.head_included,
    status: row.status,
    statusSince: row.status_since,
    peak: row.peak,
    owner: row.owner,
    fileNote: row.file_note,
    dateRequested: row.date_requested,
    dateReceived: row.date_received,
    queried: row.queried,
    dateQueried: row.date_queried,
    followups: row.followups,
    lastContact: row.last_contact,
    remarks: row.remarks,
    adhoc: row.adhoc,
    due: row.due,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/items?engagementId=...
router.get('/', async (req, res) => {
  const { engagementId } = req.query;
  if (!engagementId) return res.status(400).json({ error: 'engagementId required' });

  try {
    // Student guard: verify they own this engagement
    if (req.user.role === 'student') {
      const { rows } = await pool.query(
        'SELECT incharge FROM engagements WHERE id = $1',
        [engagementId]
      );
      if (!rows[0] || rows[0].incharge !== req.user.name) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
    }

    const { rows } = await pool.query(
      'SELECT * FROM items WHERE engagement_id = $1 ORDER BY head_id, ref',
      [engagementId]
    );
    res.json({ items: rows.map(toItem) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/items/:id
router.patch('/:id', async (req, res) => {
  const allowed = [
    'status', 'statusSince', 'peak', 'owner', 'fileNote', 'dateRequested',
    'dateReceived', 'queried', 'dateQueried', 'followups', 'lastContact',
    'remarks', 'due', 'value', 'requestable', 'headIncluded', 'ref', 'section', 'sub', 'p'
  ];

  // Column name mapping camelCase -> snake_case
  const colMap = {
    status: 'status', statusSince: 'status_since', peak: 'peak', owner: 'owner',
    fileNote: 'file_note', dateRequested: 'date_requested', dateReceived: 'date_received',
    queried: 'queried', dateQueried: 'date_queried', followups: 'followups',
    lastContact: 'last_contact', remarks: 'remarks', due: 'due', value: 'value',
    requestable: 'requestable', headIncluded: 'head_included', ref: 'ref',
    section: 'section', sub: 'sub', p: 'p',
  };

  try {
    const updates = [];
    const values = [];
    let i = 1;

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates.push(`${colMap[key]} = $${i++}`);
        values.push(req.body[key]);
      }
    }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });

    updates.push('updated_at = NOW()');
    values.push(req.params.id);

    const { rows } = await pool.query(
      `UPDATE items SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    if (!rows[0]) return res.status(404).json({ error: 'Item not found' });
    res.json({ item: toItem(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/items/bulk  — batch status updates
router.patch('/bulk', async (req, res) => {
  const { updates } = req.body;
  if (!Array.isArray(updates) || !updates.length) {
    return res.status(400).json({ error: 'updates array required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const results = [];

    for (const { id, ...fields } of updates) {
      const colMap = {
        status: 'status', statusSince: 'status_since', owner: 'owner',
        fileNote: 'file_note', remarks: 'remarks', headIncluded: 'head_included',
      };
      const cols = [];
      const vals = [];
      let i = 1;
      for (const [k, col] of Object.entries(colMap)) {
        if (fields[k] !== undefined) { cols.push(`${col} = $${i++}`); vals.push(fields[k]); }
      }
      if (!cols.length) continue;
      cols.push('updated_at = NOW()');
      vals.push(id);
      const { rows } = await client.query(
        `UPDATE items SET ${cols.join(', ')} WHERE id = $${i} RETURNING *`,
        vals
      );
      if (rows[0]) results.push(toItem(rows[0]));
    }

    await client.query('COMMIT');
    res.json({ updated: results.length, items: results });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// POST /api/items/adhoc
router.post('/adhoc', async (req, res) => {
  const { engagementId, p, due = '', owner = '', remarks = '' } = req.body;
  if (!engagementId || !p) return res.status(400).json({ error: 'engagementId and p required' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO items (engagement_id, p, adhoc, owner, due, remarks, status)
       VALUES ($1, $2, true, $3, $4, $5, 'No progress') RETURNING *`,
      [engagementId, p, owner, due, remarks]
    );
    res.status(201).json({ item: toItem(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/items/:id
router.delete('/:id', rbac('partner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      'DELETE FROM items WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Item not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
