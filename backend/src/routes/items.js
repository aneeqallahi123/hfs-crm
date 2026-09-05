import { Router } from 'express';
import { pool } from '../db/pool.js';
import { rbac } from '../middleware/rbac.js';
import { logEvent } from '../db/events.js';

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
    const { rows: beforeRows } = await pool.query(
      `SELECT i.*, e.module AS eng_module, e.client_id AS eng_client_id
       FROM items i JOIN engagements e ON e.id = i.engagement_id WHERE i.id = $1`,
      [req.params.id]
    );
    const before = beforeRows[0];
    if (!before) return res.status(404).json({ error: 'Item not found' });

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
    const after = rows[0];
    if (!after) return res.status(404).json({ error: 'Item not found' });

    const ctx = {
      by: req.user.name, userId: req.user.sub, module: before.eng_module,
      engagementId: before.engagement_id, clientId: before.eng_client_id,
      entity: 'item', entityId: after.id, label: after.p,
    };
    if (req.body.status !== undefined && after.status !== before.status) {
      await logEvent({ ...ctx, type: 'item.status', from: before.status, to: after.status });
    }
    if (req.body.owner !== undefined && after.owner !== before.owner) {
      await logEvent({ ...ctx, type: 'item.owner', from: before.owner, to: after.owner });
    }
    if (req.body.due !== undefined && after.due !== before.due) {
      await logEvent({ ...ctx, type: 'item.due', from: before.due, to: after.due });
    }
    if (req.body.dateReceived !== undefined && after.date_received !== before.date_received) {
      await logEvent({ ...ctx, type: 'item.received_date', from: before.date_received, to: after.date_received });
    }
    if (req.body.requestable !== undefined && after.requestable !== before.requestable) {
      await logEvent({ ...ctx, type: 'item.requestable', to: after.requestable ? 'client-provided' : 'team work' });
    }

    res.json({ item: toItem(after) });
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
// Adds an extra, one-off item. Defaults to the Ad-hoc bucket; pass headId/section/sub
// (plus requestable) to instead add an extra item under an existing library heading.
router.post('/adhoc', async (req, res) => {
  const {
    engagementId, p, due = '', owner = '', remarks = '',
    headId = 'adhoc', section = 'Z', sub = 'Ad-hoc', requestable = false,
  } = req.body;
  if (!engagementId || !p) return res.status(400).json({ error: 'engagementId and p required' });

  try {
    const { rows: engRows } = await pool.query(
      'SELECT module, client_id FROM engagements WHERE id = $1', [engagementId]
    );
    if (!engRows[0]) return res.status(404).json({ error: 'Engagement not found' });

    const isAdhocBucket = headId === 'adhoc';
    const { rows } = await pool.query(
      `INSERT INTO items (engagement_id, ref, section, head_id, sub, p, adhoc, requestable, head_included, owner, due, remarks, status)
       VALUES ($1, '+', $6, $7, $8, $2, $10, $9, true, $3, $4, $5, 'No progress') RETURNING *`,
      [engagementId, p, owner, due, remarks, section, headId, sub, requestable, isAdhocBucket]
    );
    const item = rows[0];
    await logEvent({
      by: req.user.name, userId: req.user.sub, module: engRows[0].module,
      engagementId, clientId: engRows[0].client_id,
      entity: 'item', entityId: item.id, label: item.p, type: 'item.added',
    });
    res.status(201).json({ item: toItem(item) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/items/:id
router.delete('/:id', rbac('partner', 'manager'), async (req, res) => {
  try {
    const { rows: beforeRows } = await pool.query(
      `SELECT i.*, e.module AS eng_module, e.client_id AS eng_client_id
       FROM items i JOIN engagements e ON e.id = i.engagement_id WHERE i.id = $1`,
      [req.params.id]
    );
    const before = beforeRows[0];
    const { rows } = await pool.query(
      'DELETE FROM items WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Item not found' });
    if (before) {
      await logEvent({
        by: req.user.name, userId: req.user.sub, module: before.eng_module,
        engagementId: before.engagement_id, clientId: before.eng_client_id,
        entity: 'item', entityId: before.id, label: before.p, type: 'item.removed', from: before.owner,
      });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
