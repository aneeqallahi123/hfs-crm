import { Router } from 'express';
import { pool } from '../db/pool.js';
import { rbac } from '../middleware/rbac.js';

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

    const library = heads.map(h => ({
      id: h.id,
      headId: h.head_id,
      section: h.section,
      sub: h.sub,
      sortOrder: h.sort_order,
      items: items
        .filter(it => it.head_id_fk === h.id)
        .map(it => ({
          id: it.id,
          ref: it.ref,
          p: it.p,
          req: it.req,
          taskType: it.task_type || 'document',
          sortOrder: it.sort_order,
        })),
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
          `INSERT INTO library_items (head_id_fk, ref, p, req, task_type, sort_order) VALUES ($1, $2, $3, $4, $5, $6)`,
          [h.id, it.ref || '', it.p || '', it.req !== false, it.taskType || 'document', ii]
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

export default router;
