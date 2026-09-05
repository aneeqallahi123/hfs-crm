import { Router } from 'express';
import { pool } from '../db/pool.js';
import { rbac } from '../middleware/rbac.js';

const router = Router();

// GET /api/events?engagementId=...&clientId=...&type=...&day=...&limit=...
router.get('/', rbac('partner', 'manager'), async (req, res) => {
  try {
    const { engagementId, clientId, type, day, limit = 200 } = req.query;
    const conditions = [];
    const values = [];
    let i = 1;

    if (engagementId) { conditions.push(`engagement_id = $${i++}`); values.push(engagementId); }
    if (clientId)     { conditions.push(`client_id = $${i++}`);     values.push(clientId); }
    if (type)         { conditions.push(`type = $${i++}`);          values.push(type); }
    if (day)          { conditions.push(`day = $${i++}`);           values.push(day); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    values.push(Math.min(parseInt(limit) || 200, 1000));

    const { rows } = await pool.query(
      `SELECT * FROM events ${where} ORDER BY at DESC LIMIT $${i}`,
      values
    );

    res.json({ events: rows.map(r => ({
      id: r.id,
      at: r.at,
      day: r.day,
      by: r.by,
      userId: r.user_id,
      module: r.module,
      type: r.type,
      engagementId: r.engagement_id,
      clientId: r.client_id,
      entity: r.entity,
      entityId: r.entity_id,
      label: r.label,
      fromVal: r.from_val,
      toVal: r.to_val,
    })) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
