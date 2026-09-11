import { Router } from 'express';
import multer from 'multer';
import { pool } from '../db/pool.js';
import { rbac } from '../middleware/rbac.js';
import { logEvent } from '../db/events.js';
import { minioClient, getPresignedUrl, deleteFile } from '../storage/minio.js';

const BUCKET = process.env.MINIO_BUCKET;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

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
    adHocOwner: row.ad_hoc_owner || '',
    contextDocKey: row.context_doc_key || '',
    contextDocName: row.context_doc_name || '',
    contextDocSize: row.context_doc_size || 0,
    // Library-level context doc (populated by JOIN in GET endpoint)
    libContextDocKey: row.lib_context_doc_key || '',
    libContextDocName: row.lib_context_doc_name || '',
    libContextDocUrl: row.lib_context_doc_url || null,
    contextDocUrl: row.context_doc_url || null,
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
      `SELECT i.*,
              li.context_doc_key  AS lib_context_doc_key,
              li.context_doc_name AS lib_context_doc_name
       FROM items i
       LEFT JOIN engagements e ON e.id = i.engagement_id
       LEFT JOIN library_heads lh ON lh.head_id = i.head_id AND lh.module = e.module
       LEFT JOIN library_items li ON li.head_id_fk = lh.id AND li.ref = i.ref
       WHERE i.engagement_id = $1
       ORDER BY i.head_id, i.ref`,
      [engagementId]
    );
    const items = await Promise.all(rows.map(async row => {
      let libContextDocUrl = null;
      if (row.lib_context_doc_key) {
        try { libContextDocUrl = await getPresignedUrl(row.lib_context_doc_key); } catch {}
      }
      let contextDocUrl = null;
      if (row.context_doc_key) {
        try { contextDocUrl = await getPresignedUrl(row.context_doc_key); } catch {}
      }
      return toItem({ ...row, lib_context_doc_url: libContextDocUrl, context_doc_url: contextDocUrl });
    }));
    res.json({ items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/items/bulk  — must come BEFORE /:id to avoid Express matching "bulk" as a UUID
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
        status: 'status', statusSince: 'status_since', owner: 'owner', adHocOwner: 'ad_hoc_owner',
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

// PATCH /api/items/:id
router.patch('/:id', async (req, res) => {
  const allowed = [
    'status', 'statusSince', 'peak', 'owner', 'adHocOwner', 'fileNote', 'dateRequested',
    'dateReceived', 'queried', 'dateQueried', 'followups', 'lastContact',
    'remarks', 'due', 'value', 'kind', 'requestable', 'headIncluded', 'ref', 'section', 'sub', 'p'
  ];

  const colMap = {
    status: 'status', statusSince: 'status_since', peak: 'peak', owner: 'owner',
    adHocOwner: 'ad_hoc_owner',
    fileNote: 'file_note', dateRequested: 'date_requested', dateReceived: 'date_received',
    queried: 'queried', dateQueried: 'date_queried', followups: 'followups',
    lastContact: 'last_contact', remarks: 'remarks', due: 'due', value: 'value', kind: 'kind',
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

// POST /api/items/adhoc
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

// POST /api/items/:id/context-doc — upload engagement-specific context doc
router.post('/:id/context-doc', rbac('partner', 'manager'), upload.single('file'), async (req, res) => {
  const { id } = req.params;
  if (!req.file) return res.status(400).json({ error: 'file required' });
  try {
    const { rows } = await pool.query('SELECT context_doc_key FROM items WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Item not found' });
    if (rows[0].context_doc_key) {
      try { await deleteFile(rows[0].context_doc_key); } catch {}
    }
    const ext = req.file.originalname.split('.').pop();
    const key = `item-context/${id}/${Date.now()}.${ext}`;
    await minioClient.putObject(BUCKET, key, req.file.buffer, req.file.buffer.length, { 'Content-Type': req.file.mimetype });
    await pool.query(
      `UPDATE items SET context_doc_key=$1, context_doc_name=$2, context_doc_size=$3, updated_at=NOW() WHERE id=$4`,
      [key, req.file.originalname, req.file.size, id]
    );
    let contextDocUrl = null;
    try { contextDocUrl = await getPresignedUrl(key); } catch {}
    res.json({ contextDocKey: key, contextDocName: req.file.originalname, contextDocSize: req.file.size, contextDocUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/items/:id/context-doc
router.delete('/:id/context-doc', rbac('partner', 'manager'), async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query('SELECT context_doc_key FROM items WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Item not found' });
    if (rows[0].context_doc_key) {
      try { await deleteFile(rows[0].context_doc_key); } catch {}
    }
    await pool.query(`UPDATE items SET context_doc_key='', context_doc_name='', context_doc_size=0, updated_at=NOW() WHERE id=$1`, [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
