import { Router } from 'express';
import { pool } from '../db/pool.js';
import { rbac } from '../middleware/rbac.js';
import { upload } from '../middleware/upload.js';
import { minioClient, getPresignedUrl, deleteFile } from '../storage/minio.js';

const BUCKET = process.env.MINIO_BUCKET;

const router = Router();

// GET /api/library?module=audit
router.get('/', async (req, res) => {
  const module = req.query.module || 'audit';
  try {
    const { rows: heads } = await pool.query(
      `SELECT * FROM library_heads WHERE module = $1 ORDER BY sort_order, head_id`,
      [module]
    );
    const headIds = heads.map(h => h.id);
    let items = [];
    if (headIds.length) {
      const { rows } = await pool.query(
        `SELECT * FROM library_items WHERE head_id_fk = ANY($1) ORDER BY sort_order, ref`,
        [headIds]
      );
      items = rows;
    }

    const library = await Promise.all(heads.map(async h => {
      const headItems = items.filter(it => it.head_id_fk === h.id);
      const mappedItems = await Promise.all(headItems.map(async it => {
        let contextDocUrl = null;
        if (it.context_doc_key) {
          try { contextDocUrl = await getPresignedUrl(it.context_doc_key); } catch {}
        }
        return {
          id: it.id,
          ref: it.ref,
          p: it.p,
          req: it.req,
          taskType: it.task_type || 'document',
          sortOrder: it.sort_order,
          contextDocKey: it.context_doc_key || '',
          contextDocName: it.context_doc_name || '',
          contextDocSize: it.context_doc_size || 0,
          contextDocUrl,
        };
      }));
      return {
        id: h.id,
        headId: h.head_id,
        section: h.section,
        sub: h.sub,
        sortOrder: h.sort_order,
        items: mappedItems,
      };
    }));

    res.json({ module, library });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/library/:module — full replace (partner only)
router.put('/:module', rbac('partner'), async (req, res) => {
  const { module } = req.params;
  const { library } = req.body;
  if (!Array.isArray(library)) return res.status(400).json({ error: 'library array required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Delete existing heads (cascades to items via ON DELETE CASCADE)
    await client.query(`DELETE FROM library_heads WHERE module = $1`, [module]);

    for (let hi = 0; hi < library.length; hi++) {
      const head = library[hi];
      const { rows: [h] } = await client.query(
        `INSERT INTO library_heads (module, head_id, section, sub, sort_order)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [module, head.headId, head.section, head.sub, hi]
      );
      const items = Array.isArray(head.items) ? head.items : [];
      for (let ii = 0; ii < items.length; ii++) {
        const it = items[ii];
        await client.query(
          `INSERT INTO library_items (head_id_fk, ref, p, req, task_type, sort_order, context_doc_key, context_doc_name, context_doc_size) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [h.id, it.ref || '', it.p || '', it.req !== false, it.taskType || 'document', ii, it.contextDocKey || '', it.contextDocName || '', it.contextDocSize || 0]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ ok: true, module, heads: library.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// POST /api/library/items/:itemId/context-doc — upload a context document for a library item (partner only)
router.post('/items/:itemId/context-doc', rbac('partner'), upload.single('file'), async (req, res) => {
  const { itemId } = req.params;
  if (!req.file) return res.status(400).json({ error: 'file required' });

  try {
    const { rows } = await pool.query('SELECT * FROM library_items WHERE id = $1', [itemId]);
    if (!rows[0]) return res.status(404).json({ error: 'Item not found' });

    // Remove old context doc from MinIO if present
    if (rows[0].context_doc_key) {
      try { await deleteFile(rows[0].context_doc_key); } catch {}
    }

    const ext = req.file.originalname.split('.').pop();
    const key = `library-context/${itemId}/${Date.now()}.${ext}`;
    await minioClient.putObject(BUCKET, key, req.file.buffer, req.file.buffer.length, { 'Content-Type': req.file.mimetype });

    await pool.query(
      `UPDATE library_items SET context_doc_key=$1, context_doc_name=$2, context_doc_size=$3 WHERE id=$4`,
      [key, req.file.originalname, req.file.size, itemId]
    );

    let contextDocUrl = null;
    try { contextDocUrl = await getPresignedUrl(key); } catch {}

    res.json({ contextDocKey: key, contextDocName: req.file.originalname, contextDocSize: req.file.size, contextDocUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/library/items/:itemId/context-doc (partner only)
router.delete('/items/:itemId/context-doc', rbac('partner'), async (req, res) => {
  const { itemId } = req.params;
  try {
    const { rows } = await pool.query('SELECT context_doc_key FROM library_items WHERE id = $1', [itemId]);
    if (!rows[0]) return res.status(404).json({ error: 'Item not found' });
    if (rows[0].context_doc_key) {
      try { await deleteFile(rows[0].context_doc_key); } catch {}
    }
    await pool.query(`UPDATE library_items SET context_doc_key='', context_doc_name='', context_doc_size=0 WHERE id=$1`, [itemId]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
