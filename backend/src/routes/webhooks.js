import { Router } from 'express';
import { pool } from '../db/pool.js';
import { uploadFile } from '../storage/minio.js';

const router = Router();

function webhookAuth(req, res, next) {
  if (req.headers['x-webhook-secret'] !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

const MAX_FILE_BYTES = parseInt(process.env.MAX_INBOX_FILE_MB || '200', 10) * 1024 * 1024;

// POST /api/webhooks/inbound-file
// Called by n8n when Evolution API receives a WhatsApp file.
// n8n must call Evolution API's /chat/getBase64FromMediaMessage first to decrypt the media,
// then POST { fileBase64, mimeType, ... } here — never a raw CDN URL (those bytes are encrypted).
router.post('/inbound-file', webhookAuth, async (req, res) => {
  const { engagementId, groupId, sender, messageId, fileName, fileBase64, mimeType } = req.body;

  if (!fileBase64) {
    return res.status(400).json({ error: 'fileBase64 required — pass the decrypted file from Evolution API getBase64FromMediaMessage' });
  }

  try {
    // Dedup: skip if this messageId was already stored
    if (messageId) {
      const { rows: dup } = await pool.query(
        'SELECT id FROM inbox_files WHERE message_id = $1 LIMIT 1',
        [messageId]
      );
      if (dup[0]) return res.json({ received: true, duplicate: true });
    }

    // Decode base64 — Evolution API returns the decrypted file as base64
    const buffer = Buffer.from(fileBase64, 'base64');

    // File size guard
    if (buffer.length > MAX_FILE_BYTES) {
      return res.status(413).json({
        error: `File exceeds limit (${Math.round(buffer.length / 1024 / 1024)}MB > ${process.env.MAX_INBOX_FILE_MB || 200}MB)`,
      });
    }

    // Resolve engagementId from groupId if not provided
    let resolvedEngagementId = engagementId || null;
    let matched = !!engagementId;

    if (!resolvedEngagementId && groupId) {
      const { rows } = await pool.query(
        'SELECT id FROM engagements WHERE wa_group_id = $1 LIMIT 1',
        [groupId]
      );
      if (rows[0]) {
        resolvedEngagementId = rows[0].id;
        matched = true;
      }
    }

    // Upload to MinIO — use a placeholder engagement id for unmatched files
    const storageId = resolvedEngagementId || 'unmatched';
    const minioKey = await uploadFile(storageId, fileName, buffer, mimeType || 'application/octet-stream');
    const now = new Date().toISOString();

    if (resolvedEngagementId) {
      await pool.query(
        `INSERT INTO inbox_files
           (engagement_id, name, size, mime_type, minio_key, received_at, uploaded_at,
            source, sender, message_id, group_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, $6, 'whatsapp', $7, $8, $9, 'Unmatched')`,
        [resolvedEngagementId, fileName, buffer.length, mimeType || '', minioKey,
         now, sender || '', messageId || '', groupId || '']
      );
    } else {
      // Unknown group — store in unmatched_inbox so files aren't silently dropped
      await pool.query(
        `INSERT INTO unmatched_inbox
           (group_id, sender, message_id, name, size, mime_type, minio_key, received_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [groupId || '', sender || '', messageId || '', fileName,
         buffer.length, mimeType || '', minioKey, now]
      );
    }

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
