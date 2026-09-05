import { Router } from 'express';
import { pool } from '../db/pool.js';
import { rbac } from '../middleware/rbac.js';
import { defaultIncluded } from '../db/library_seed.js';

const router = Router();

function toEngagement(row) {
  return {
    id: row.id,
    module: row.module,
    clientId: row.client_id,
    year: row.year,
    incharge: row.incharge,
    contactPhone: row.contact_phone,
    waGroupId: row.wa_group_id,
    deadline: row.deadline,
    rolledFrom: row.rolled_from,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/engagements
router.get('/', async (req, res) => {
  try {
    const { clientId, module } = req.query;
    const values = [];
    const conditions = [];
    let i = 1;

    if (clientId) { conditions.push(`e.client_id = $${i++}`); values.push(clientId); }
    if (module)   { conditions.push(`e.module = $${i++}`);    values.push(module); }

    // Students only see their own engagements
    if (req.user.role === 'student') {
      conditions.push(`e.incharge = $${i++}`);
      values.push(req.user.name);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT e.* FROM engagements e ${where} ORDER BY e.year DESC, e.created_at DESC`,
      values
    );
    res.json({ engagements: rows.map(toEngagement) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/engagements/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM engagements WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Engagement not found' });

    // Student guard
    if (req.user.role === 'student' && rows[0].incharge !== req.user.name) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    res.json({ engagement: toEngagement(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/engagements
router.post('/', rbac('partner', 'manager'), async (req, res) => {
  const { module, clientId, year, incharge = '', contactPhone = '', waGroupId = '', deadline = '' } = req.body;
  if (!module || !clientId || !year) {
    return res.status(400).json({ error: 'module, clientId, year required' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO engagements (module, client_id, year, incharge, contact_phone, wa_group_id, deadline)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [module, clientId, year, incharge, contactPhone, waGroupId, deadline]
    );
    const eng = rows[0];

    // Seed items from library for this module
    const { rows: heads } = await client.query(
      `SELECT * FROM library_heads WHERE module = $1 ORDER BY sort_order, head_id`,
      [module]
    );
    for (const head of heads) {
      const { rows: libItems } = await client.query(
        `SELECT * FROM library_items WHERE head_id_fk = $1 ORDER BY sort_order, ref`,
        [head.id]
      );
      const included = defaultIncluded(head.section);
      for (const it of libItems) {
        await client.query(
          `INSERT INTO items
             (engagement_id, ref, section, head_id, sub, p, requestable, head_included, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'No progress')`,
          [eng.id, it.ref, head.section, head.head_id, head.sub, it.p, it.req, included]
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ engagement: toEngagement(eng) });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'Engagement already exists for this client/year/module' });
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// PATCH /api/engagements/:id
router.patch('/:id', rbac('partner', 'manager'), async (req, res) => {
  const { incharge, contactPhone, waGroupId, deadline, year } = req.body;
  try {
    const updates = [];
    const values = [];
    let i = 1;

    if (incharge !== undefined)     { updates.push(`incharge = $${i++}`);       values.push(incharge); }
    if (contactPhone !== undefined) { updates.push(`contact_phone = $${i++}`);  values.push(contactPhone); }
    if (waGroupId !== undefined)    { updates.push(`wa_group_id = $${i++}`);    values.push(waGroupId); }
    if (deadline !== undefined)     { updates.push(`deadline = $${i++}`);       values.push(deadline); }
    if (year !== undefined)         { updates.push(`year = $${i++}`);           values.push(year); }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });

    updates.push('updated_at = NOW()');
    values.push(req.params.id);

    const { rows } = await pool.query(
      `UPDATE engagements SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    if (!rows[0]) return res.status(404).json({ error: 'Engagement not found' });
    res.json({ engagement: toEngagement(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/engagements/:id — partner only
router.delete('/:id', rbac('partner'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      'DELETE FROM engagements WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Engagement not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/engagements/:id/roll-forward
// Creates a new engagement for year+1, copying all non-adhoc items reset to 'No progress'
router.post('/:id/roll-forward', rbac('partner', 'manager'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [src] } = await client.query(
      'SELECT * FROM engagements WHERE id = $1',
      [req.params.id]
    );
    if (!src) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Engagement not found' }); }

    const newYear = src.year + 1;

    // Check not already rolled
    const { rows: existing } = await client.query(
      'SELECT id FROM engagements WHERE module=$1 AND client_id=$2 AND year=$3',
      [src.module, src.client_id, newYear]
    );
    if (existing[0]) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `Engagement for ${newYear} already exists` });
    }

    const { rows: [newEng] } = await client.query(
      `INSERT INTO engagements (module, client_id, year, incharge, contact_phone, wa_group_id, deadline, rolled_from)
       VALUES ($1, $2, $3, $4, $5, $6, '', $7) RETURNING *`,
      [src.module, src.client_id, newYear, src.incharge, src.contact_phone, src.wa_group_id, src.id]
    );

    // Copy non-adhoc items, resetting status fields
    const { rows: srcItems } = await client.query(
      'SELECT * FROM items WHERE engagement_id = $1 AND adhoc = false',
      [src.id]
    );

    for (const item of srcItems) {
      await client.query(
        `INSERT INTO items
           (engagement_id, ref, section, head_id, sub, p, kind, value, requestable, head_included,
            status, status_since, peak, owner, file_note, date_requested, date_received,
            queried, date_queried, followups, last_contact, remarks, adhoc, due)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'No progress','',0,'','','','',false,'',0,'','',false,'')`,
        [newEng.id, item.ref, item.section, item.head_id, item.sub, item.p, item.kind,
         item.value, item.requestable, item.head_included]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ engagement: toEngagement(newEng), itemsCopied: srcItems.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

export default router;
