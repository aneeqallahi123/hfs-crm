import { pool } from './pool.js';

// Append-only audit trail. Never lets a logging failure break the request that triggered it.
export async function logEvent({
  by = '', userId = null, module = 'audit', type, engagementId = null, clientId = null,
  entity = '', entityId = '', label = '', from = '', to = '',
}) {
  try {
    await pool.query(
      `INSERT INTO events (day, by, user_id, module, type, engagement_id, client_id, entity, entity_id, label, from_val, to_val)
       VALUES (to_char(NOW(), 'YYYY-MM-DD'), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [by, userId, module, type, engagementId, clientId, entity, entityId, label, String(from ?? ''), String(to ?? '')]
    );
  } catch (err) {
    console.error('logEvent failed:', err);
  }
}
