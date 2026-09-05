import { Router } from 'express';
import fetch from 'node-fetch';
import { pool } from '../db/pool.js';
import { uploadFile } from '../storage/minio.js';

const router = Router();

function webhookAuth(req, res, next) {
  if (req.headers['x-webhook-secret'] !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// POST /api/webhooks/inbound-file
// Called by n8n when Evolution API receives a WhatsApp file
router.post('/inbound-file', webhookAuth, async (req, res) => {
  const { engagementId, groupId, sender, messageId, fileName, fileUrl, mimeType } = req.body;

  try {
    // Download file from WhatsApp CDN
    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) throw new Error(`Failed to download file: ${fileRes.status}`);
    const buffer = Buffer.from(await fileRes.arrayBuffer());

    // Try to resolve engagementId from groupId if not provided
    let resolvedEngagementId = engagementId;
    let matched = false;

    if (!resolvedEngagementId && groupId) {
      const { rows } = await pool.query(
        'SELECT id FROM engagements WHERE wa_group_id = $1 LIMIT 1',
        [groupId]
      );
      if (rows[0]) {
        resolvedEngagementId = rows[0].id;
        matched = true;
      }
    } else if (resolvedEngagementId) {
      matched = true;
    }

    if (!resolvedEngagementId) {
      // Store without engagement link — inbox_files requires engagement_id NOT NULL
      // Return early; n8n can retry once group is mapped
      return res.json({ received: true, matched: false, reason: 'No engagement mapped to group' });
    }

    const minioKey = await uploadFile(resolvedEngagementId, fileName, buffer, mimeType || 'application/octet-stream');
    const now = new Date().toISOString();

    await pool.query(
      `INSERT INTO inbox_files
         (engagement_id, name, size, mime_type, minio_key, received_at, uploaded_at,
          source, sender, message_id, group_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $6, 'whatsapp', $7, $8, $9, 'Unmatched')`,
      [resolvedEngagementId, fileName, buffer.length, mimeType || '', minioKey,
       now, sender || '', messageId || '', groupId || '']
    );

    res.json({ received: true, matched });
  } catch (err) {
    console.error('Webhook inbound-file error:', err);
    res.status(500).json({ error: 'Failed to process file' });
  }
});

// POST /api/webhooks/portal-sync
// Called by n8n when portal PDF is parsed — idempotent status updates
router.post('/portal-sync', webhookAuth, async (req, res) => {
  const { clientName, year, items } = req.body;
  if (!clientName || !year || !Array.isArray(items)) {
    return res.status(400).json({ error: 'clientName, year, items[] required' });
  }

  try {
    // Find engagement by client name + year
    const { rows: engRows } = await pool.query(
      `SELECT e.id, e.module, e.client_id FROM engagements e
       JOIN clients c ON c.id = e.client_id
       WHERE c.name ILIKE $1 AND e.year = $2
       LIMIT 1`,
      [clientName, year]
    );

    if (!engRows[0]) {
      return res.status(404).json({ error: 'No matching engagement found' });
    }

    const eng = engRows[0];
    const now = new Date().toISOString();
    let updated = 0;

    for (const { ref, status } of items) {
      if (!ref || !status) continue;

      // Only update if status actually changed (idempotency)
      const { rows: itemRows } = await pool.query(
        'SELECT id, status FROM items WHERE engagement_id = $1 AND ref = $2',
        [eng.id, ref]
      );

      if (!itemRows[0] || itemRows[0].status === status) continue;

      const oldStatus = itemRows[0].status;
      await pool.query(
        `UPDATE items SET status = $1, status_since = $2, updated_at = NOW() WHERE id = $3`,
        [status, now.slice(0, 10), itemRows[0].id]
      );

      await pool.query(
        `INSERT INTO events
           (day, by, module, type, engagement_id, client_id, entity, entity_id, label, from_val, to_val)
         VALUES ($1, 'portal-sync', $2, 'item.status', $3, $4, 'item', $5, $6, $7, $8)`,
        [now.slice(0, 10), eng.module, eng.id, eng.client_id,
         itemRows[0].id, ref, oldStatus, status]
      );

      updated++;
    }

    res.json({ updated });
  } catch (err) {
    console.error('Webhook portal-sync error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
