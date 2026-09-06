import { Router } from 'express';
import { pool } from '../db/pool.js';
import { rbac } from '../middleware/rbac.js';
import multer from 'multer';
import { minioClient, getPresignedUrl, deleteFile } from '../storage/minio.js';
import { SECTION_NAMES } from '../db/library_seed.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ── Library: merged view ─────────────────────────────────────────────────────

// GET /api/clients/:id/library?module=audit
router.get('/:id/library', async (req, res) => {
  const { id: clientId } = req.params;
  const module = req.query.module || 'audit';
  try {
    const { rows: masterHeads } = await pool.query(
      'SELECT * FROM library_heads WHERE module = $1 ORDER BY sort_order, head_id',
      [module]
    );

    let masterItems = [];
    if (masterHeads.length) {
      const { rows } = await pool.query(
        'SELECT * FROM library_items WHERE head_id_fk = ANY($1) ORDER BY sort_order, ref',
        [masterHeads.map(h => h.id)]
      );
      masterItems = rows;
    }

    const [
      { rows: headExcl },
      { rows: itemExcl },
      { rows: customHeads },
      { rows: customItems },
      { rows: yearRows },
    ] = await Promise.all([
      pool.query('SELECT head_id FROM client_lib_exclusions WHERE client_id = $1', [clientId]),
      pool.query('SELECT item_id FROM client_lib_item_exclusions WHERE client_id = $1', [clientId]),
      pool.query('SELECT * FROM client_lib_custom_heads WHERE client_id = $1 ORDER BY section, sort_order', [clientId]),
      pool.query('SELECT * FROM client_lib_custom_items WHERE client_id = $1 ORDER BY sort_order', [clientId]),
      pool.query('SELECT DISTINCT year FROM client_item_values WHERE client_id = $1 ORDER BY year DESC', [clientId]),
    ]);

    const excludedHeads = new Set(headExcl.map(r => r.head_id));
    const excludedItems = new Set(itemExcl.map(r => r.item_id));

    const sectionSet = new Set([
      ...Object.keys(SECTION_NAMES),
      ...masterHeads.map(h => h.section),
      ...customHeads.map(h => h.section),
    ]);

    const library = [...sectionSet].sort().map(section => {
      const mHeads = masterHeads
        .filter(h => h.section === section)
        .map(h => ({
          headId: h.id,
          headRef: h.head_id,
          isCustom: false,
          sub: h.sub,
          excluded: excludedHeads.has(h.id),
          items: masterItems
            .filter(it => it.head_id_fk === h.id)
            .map(it => ({
              itemId: it.id,
              isCustom: false,
              ref: it.ref,
              p: it.p,
              req: it.req,
              taskType: it.task_type || 'document',
              excluded: excludedItems.has(it.id),
            })),
          customItems: customItems
            .filter(ci => ci.head_id_fk === h.id)
            .map(toCustomItem),
        }));

      const cHeads = customHeads
        .filter(h => h.section === section)
        .map(h => ({
          headId: h.id,
          isCustom: true,
          sub: h.sub,
          excluded: false,
          items: [],
          customItems: customItems
            .filter(ci => ci.custom_head_fk === h.id)
            .map(toCustomItem),
        }));

      const heads = [...mHeads, ...cHeads];
      if (!heads.length) return null;
      return { section, sectionName: SECTION_NAMES[section] || section, heads };
    }).filter(Boolean);

    res.json({ library, years: yearRows.map(r => r.year) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function toCustomItem(ci) {
  return { itemId: ci.id, isCustom: true, ref: ci.ref, p: ci.p, req: ci.req, taskType: ci.task_type };
}

// ── Library: exclusion management ────────────────────────────────────────────

// POST /api/clients/:id/library/exclude-head  { headId }
router.post('/:id/library/exclude-head', rbac('partner', 'manager'), async (req, res) => {
  const { id: clientId } = req.params;
  const { headId } = req.body;
  if (!headId) return res.status(400).json({ error: 'headId required' });
  try {
    await pool.query(
      'INSERT INTO client_lib_exclusions(client_id, head_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
      [clientId, headId]
    );
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// DELETE /api/clients/:id/library/exclude-head/:headId
router.delete('/:id/library/exclude-head/:headId', rbac('partner', 'manager'), async (req, res) => {
  const { id: clientId, headId } = req.params;
  try {
    await pool.query('DELETE FROM client_lib_exclusions WHERE client_id=$1 AND head_id=$2', [clientId, headId]);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// POST /api/clients/:id/library/exclude-item  { itemId }
router.post('/:id/library/exclude-item', rbac('partner', 'manager'), async (req, res) => {
  const { id: clientId } = req.params;
  const { itemId } = req.body;
  if (!itemId) return res.status(400).json({ error: 'itemId required' });
  try {
    await pool.query(
      'INSERT INTO client_lib_item_exclusions(client_id, item_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
      [clientId, itemId]
    );
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// DELETE /api/clients/:id/library/exclude-item/:itemId
router.delete('/:id/library/exclude-item/:itemId', rbac('partner', 'manager'), async (req, res) => {
  const { id: clientId, itemId } = req.params;
  try {
    await pool.query('DELETE FROM client_lib_item_exclusions WHERE client_id=$1 AND item_id=$2', [clientId, itemId]);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── Library: custom heads & items ─────────────────────────────────────────────

// POST /api/clients/:id/library/custom-heads  { section, sub }
router.post('/:id/library/custom-heads', rbac('partner', 'manager'), async (req, res) => {
  const { id: clientId } = req.params;
  const { section, sub } = req.body;
  if (!section || !sub) return res.status(400).json({ error: 'section and sub required' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO client_lib_custom_heads(client_id, section, sub) VALUES($1,$2,$3) RETURNING *',
      [clientId, section, sub]
    );
    res.status(201).json({ head: rows[0] });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// DELETE /api/clients/:id/library/custom-heads/:customHeadId
router.delete('/:id/library/custom-heads/:customHeadId', rbac('partner', 'manager'), async (req, res) => {
  const { id: clientId, customHeadId } = req.params;
  try {
    await pool.query('DELETE FROM client_lib_custom_heads WHERE id=$1 AND client_id=$2', [customHeadId, clientId]);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// POST /api/clients/:id/library/custom-heads/:customHeadId/items  { p, ref?, req?, taskType? }
router.post('/:id/library/custom-heads/:customHeadId/items', rbac('partner', 'manager'), async (req, res) => {
  const { id: clientId, customHeadId } = req.params;
  const { p, ref = '', req: reqField = true, taskType = 'document' } = req.body;
  if (!p) return res.status(400).json({ error: 'p required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO client_lib_custom_items(client_id, custom_head_fk, ref, p, req, task_type)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [clientId, customHeadId, ref, p, reqField, taskType]
    );
    res.status(201).json({ item: toCustomItem(rows[0]) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// POST /api/clients/:id/library/master-heads/:masterHeadId/items  { p, ref?, req?, taskType? }
router.post('/:id/library/master-heads/:masterHeadId/items', rbac('partner', 'manager'), async (req, res) => {
  const { id: clientId, masterHeadId } = req.params;
  const { p, ref = '', req: reqField = true, taskType = 'document' } = req.body;
  if (!p) return res.status(400).json({ error: 'p required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO client_lib_custom_items(client_id, head_id_fk, ref, p, req, task_type)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [clientId, masterHeadId, ref, p, reqField, taskType]
    );
    res.status(201).json({ item: toCustomItem(rows[0]) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// DELETE /api/clients/:id/library/custom-items/:customItemId
router.delete('/:id/library/custom-items/:customItemId', rbac('partner', 'manager'), async (req, res) => {
  const { id: clientId, customItemId } = req.params;
  try {
    await pool.query('DELETE FROM client_lib_custom_items WHERE id=$1 AND client_id=$2', [customItemId, clientId]);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── Values ───────────────────────────────────────────────────────────────────

// GET /api/clients/:id/values
router.get('/:id/values', async (req, res) => {
  const { id: clientId } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT id, client_id, library_item_id, custom_item_id, year,
              text_value, minio_key, file_name, file_size, uploaded_at, created_at
       FROM client_item_values WHERE client_id = $1 ORDER BY year DESC, created_at`,
      [clientId]
    );
    const values = await Promise.all(rows.map(async r => {
      let downloadUrl = null;
      if (r.minio_key) {
        try { downloadUrl = await getPresignedUrl(r.minio_key); } catch {}
      }
      return {
        id: r.id,
        libraryItemId: r.library_item_id,
        customItemId: r.custom_item_id,
        year: r.year,
        textValue: r.text_value,
        minioKey: r.minio_key,
        fileName: r.file_name,
        fileSize: r.file_size,
        uploadedAt: r.uploaded_at,
        downloadUrl,
      };
    }));
    res.json({ values });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// PUT /api/clients/:id/values  { libraryItemId|customItemId, year, textValue }
router.put('/:id/values', rbac('partner', 'manager'), async (req, res) => {
  const { id: clientId } = req.params;
  const { libraryItemId, customItemId, year, textValue } = req.body;
  if (!year) return res.status(400).json({ error: 'year required' });
  if (!libraryItemId && !customItemId) return res.status(400).json({ error: 'libraryItemId or customItemId required' });
  try {
    const { rows: existing } = await pool.query(
      `SELECT id FROM client_item_values WHERE client_id=$1 AND year=$2
       AND (library_item_id IS NOT DISTINCT FROM $3) AND (custom_item_id IS NOT DISTINCT FROM $4)`,
      [clientId, year, libraryItemId || null, customItemId || null]
    );
    let row;
    if (existing.length) {
      const { rows } = await pool.query(
        'UPDATE client_item_values SET text_value=$1, minio_key=NULL, file_name=NULL, file_size=NULL, uploaded_at=NULL WHERE id=$2 RETURNING *',
        [textValue ?? null, existing[0].id]
      );
      row = rows[0];
    } else {
      const { rows } = await pool.query(
        `INSERT INTO client_item_values(client_id, library_item_id, custom_item_id, year, text_value)
         VALUES($1,$2,$3,$4,$5) RETURNING *`,
        [clientId, libraryItemId || null, customItemId || null, year, textValue ?? null]
      );
      row = rows[0];
    }
    res.json({ value: row });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// DELETE /api/clients/:id/values/:valueId
router.delete('/:id/values/:valueId', rbac('partner', 'manager'), async (req, res) => {
  const { id: clientId, valueId } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT minio_key FROM client_item_values WHERE id=$1 AND client_id=$2', [valueId, clientId]
    );
    if (rows[0]?.minio_key) {
      try { await deleteFile(rows[0].minio_key); } catch {}
    }
    await pool.query('DELETE FROM client_item_values WHERE id=$1 AND client_id=$2', [valueId, clientId]);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// POST /api/clients/:id/values/upload  (multipart: libraryItemId|customItemId, year, file)
router.post('/:id/values/upload', rbac('partner', 'manager'), upload.single('file'), async (req, res) => {
  const { id: clientId } = req.params;
  const { libraryItemId, customItemId, year } = req.body;
  if (!req.file) return res.status(400).json({ error: 'file required' });
  if (!year) return res.status(400).json({ error: 'year required' });
  if (!libraryItemId && !customItemId) return res.status(400).json({ error: 'libraryItemId or customItemId required' });

  try {
    const ext = (req.file.originalname.split('.').pop() || 'bin').toLowerCase();
    const key = `clients/${clientId}/values/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const BUCKET = process.env.MINIO_BUCKET;
    await minioClient.putObject(BUCKET, key, req.file.buffer, req.file.buffer.length, { 'Content-Type': req.file.mimetype });

    // Always insert a new row — multiple files allowed per item+year
    const { rows: inserted } = await pool.query(
      `INSERT INTO client_item_values(client_id, library_item_id, custom_item_id, year, minio_key, file_name, file_size, uploaded_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,now()) RETURNING id`,
      [clientId, libraryItemId || null, customItemId || null, year, key, req.file.originalname, req.file.size]
    );

    const downloadUrl = await getPresignedUrl(key);
    res.json({ ok: true, id: inserted[0].id, key, fileName: req.file.originalname, downloadUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
