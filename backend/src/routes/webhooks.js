import { Router } from 'express';
import { pool } from '../db/pool.js';
import { uploadFile, statFile, copyFile, buildObjectKey, MINIO_SDK_VERSION } from '../storage/minio.js';

const router = Router();

function webhookAuth(req, res, next) {
  if (req.headers['x-webhook-secret'] !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

const BUCKET = process.env.MINIO_BUCKET;
const MAX_FILE_BYTES = parseInt(process.env.MAX_INBOX_FILE_MB || '200', 10) * 1024 * 1024;

// The legacy base64 path is capped far lower than MAX_INBOX_FILE_MB on purpose: it
// carries the bytes through n8n and Railway, where Cloudflare's 100MB proxy cap, n8n's
// 16MB default payload limit and the 1.33x base64 inflation all apply. Large files must
// come through the mediaUrl path instead, where the bytes never leave the Mini PC.
const LEGACY_BASE64_MAX_BYTES = parseInt(process.env.MAX_INBOX_BASE64_MB || '15', 10) * 1024 * 1024;

// Evolution fires MESSAGES_UPSERT as soon as the message arrives, which can be BEFORE it has
// finished decrypting the media and writing it to MinIO. So a first-attempt miss is normal and
// means "not yet", not "never" — we wait for it rather than dropping the file. The window widens
// with file size, which is exactly when dropping would hurt most.
const MEDIA_WAIT_MS = parseInt(process.env.MEDIA_WAIT_MS || '10000', 10);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isNotFound(err) {
  return err?.code === 'NotFound' || err?.code === 'NoSuchKey' || err?.statusCode === 404;
}

// Retry until the source object exists or the budget runs out. Anything that is not a
// "missing object" error (bad credentials, MinIO unreachable) fails immediately — retrying
// those just burns the n8n request timeout and hides the real cause.
async function copyWithWait(destKey, sourceKey, budgetMs = MEDIA_WAIT_MS) {
  const deadline = Date.now() + budgetMs;
  let delay = 400;

  for (;;) {
    try {
      return await copyFile(destKey, sourceKey);
    } catch (err) {
      if (!isNotFound(err)) throw err;
      if (Date.now() + delay >= deadline) throw err;
      await sleep(delay);
      delay = Math.min(delay * 2, 2000);
    }
  }
}

// Evolution API (S3_ENABLED) writes received media straight to MinIO and reports it as a
// URL shaped like {endpoint}/{bucket}/{key}, sometimes with presign query params. We only
// want the object key — the URL's host is the Mini PC's internal address and is not
// reachable from Railway, but it does not need to be: the object is already in our bucket.
export function deriveMinioKey(mediaRef) {
  if (!mediaRef || typeof mediaRef !== 'string') return null;

  let path;
  try {
    path = new URL(mediaRef).pathname; // also drops any query string
  } catch {
    path = mediaRef.split('?')[0]; // already a bare key rather than a URL
  }

  let key;
  try {
    key = decodeURIComponent(path);
  } catch {
    key = path; // malformed percent-encoding — take it as-is
  }
  key = key.replace(/^\/+/, '');

  // Path-style URLs include the bucket as the first segment; keys do not.
  if (BUCKET && (key === BUCKET || key.startsWith(`${BUCKET}/`))) {
    key = key.slice(BUCKET.length).replace(/^\/+/, '');
  }

  if (!key || key.split('/').some((seg) => seg === '..')) return null;
  return key;
}

// POST /api/webhooks/inbound-file
// Called by n8n when Evolution API receives a WhatsApp file.
//
// Preferred payload: { mediaUrl | mediaKey, groupId, sender, messageId, fileName, mimeType }
//   Evolution API has already written the bytes to MinIO (S3_ENABLED, pointed at MinIO over
//   localhost), so this request is ~1KB of metadata no matter how large the file is. That is
//   what makes 200MB files work: the bytes never cross n8n, Railway, or Cloudflare.
//
// Legacy payload: { fileBase64, ... } — still accepted for small files so that the old
// workflow keeps working during rollout, but capped at MAX_INBOX_BASE64_MB.
router.post('/inbound-file', webhookAuth, async (req, res) => {
  const {
    engagementId, groupId, sender, messageId, fileName, mimeType,
    mediaUrl, mediaKey, fileBase64, size: reportedSize,
  } = req.body;

  if (!mediaUrl && !mediaKey && !fileBase64) {
    return res.status(400).json({
      error: 'mediaUrl (or mediaKey) required — enable S3_ENABLED on Evolution API so it writes media to MinIO directly. fileBase64 is accepted only for small files.',
    });
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

    let resolvedEngagementId = engagementId || null;
    if (!resolvedEngagementId && groupId) {
      const { rows } = await pool.query(
        'SELECT id FROM engagements WHERE wa_group_id = $1 LIMIT 1',
        [groupId]
      );
      if (rows[0]) resolvedEngagementId = rows[0].id;
    }

    let minioKey;
    let size;

    if (mediaUrl || mediaKey) {
      const sourceKey = deriveMinioKey(mediaKey || mediaUrl);
      if (!sourceKey) {
        return res.status(400).json({ error: `Could not derive a MinIO object key from "${mediaKey || mediaUrl}"` });
      }

      // Re-key onto a plain-ASCII path we control. Evolution names objects after the WhatsApp
      // group JID and the sender's filename, so they routinely contain "@", spaces and
      // non-ASCII — and per-object GET/HEAD on those succeeds or fails depending on which
      // Cloudflare edge the request reaches, which is not something to build an inbox on.
      // The copy is server-side (source rides in a header, not the path) so it is free even
      // at 200MB, and everything downstream then uses the same key shape as manual uploads.
      minioKey = buildObjectKey(resolvedEngagementId || 'unmatched', fileName);

      try {
        await copyWithWait(minioKey, sourceKey);
      } catch (err) {
        console.error(`Inbound file: MinIO copy/stat failed (source "${sourceKey}" -> "${minioKey}"):`, err.message);

        if (!isNotFound(err)) {
          // Credentials, connectivity, bucket policy, or a signature that did not survive the
          // trip — not a timing problem. Surface the S3 error code verbatim: the message alone
          // is ambiguous (MinIO reports a mangled-path signature failure and genuinely bad keys
          // with similar wording), and guessing from it sends you down the wrong path.
          return res.status(502).json({
            error: `MinIO error copying "${sourceKey}" to "${minioKey}": ${err.message}`,
            s3Code: err?.code ?? null,
            httpStatus: err?.statusCode ?? null,
            endpoint: `${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}`,
            bucket: BUCKET,
            minioSdk: MINIO_SDK_VERSION,
          });
        }

        // Still absent after waiting. Signal retryable so n8n's retry can pick it up once
        // a slow upload lands, rather than losing the file.
        return res.status(409).json({
          error: `Media not yet in MinIO at key "${sourceKey}" after ${MEDIA_WAIT_MS}ms — Evolution may still be uploading, or its S3_BUCKET may not match MINIO_BUCKET (${BUCKET})`,
          retryable: true,
        });
      }

      // The copy succeeded, so the file is stored and this request will not fail from here on.
      // The stat is only to record an accurate size, so treat it as best-effort: it can throw,
      // and stat.size derives from content-length, which Cloudflare rewrites for compressible
      // content, so even a successful HEAD can yield NaN. Fall back to the size the webhook
      // reported, then to null, rather than losing the file or writing NaN into a bigint.
      let stat = null;
      try {
        stat = await statFile(minioKey);
      } catch (err) {
        console.warn(`Inbound file: size lookup failed for "${minioKey}" (file is stored):`, err.message);
      }

      size = Number.isFinite(stat?.size) ? stat.size : (Number(reportedSize) || null);
      if (size > MAX_FILE_BYTES) {
        return res.status(413).json({
          error: `File exceeds limit (${Math.round(size / 1024 / 1024)}MB > ${process.env.MAX_INBOX_FILE_MB || 200}MB)`,
        });
      }
    } else {
      const buffer = Buffer.from(fileBase64, 'base64');
      if (buffer.length > LEGACY_BASE64_MAX_BYTES) {
        return res.status(413).json({
          error: `File too large for the base64 path (${Math.round(buffer.length / 1024 / 1024)}MB > ${process.env.MAX_INBOX_BASE64_MB || 15}MB). Send mediaUrl instead — enable S3_ENABLED on Evolution API.`,
        });
      }
      size = buffer.length;
      minioKey = await uploadFile(
        resolvedEngagementId || 'unmatched',
        fileName,
        buffer,
        mimeType || 'application/octet-stream'
      );
    }

    const now = new Date().toISOString();

    if (resolvedEngagementId) {
      await pool.query(
        `INSERT INTO inbox_files
           (engagement_id, name, size, mime_type, minio_key, received_at, uploaded_at,
            source, sender, message_id, group_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, $6, 'whatsapp', $7, $8, $9, 'Unmatched')`,
        [resolvedEngagementId, fileName, size, mimeType || '', minioKey,
         now, sender || '', messageId || '', groupId || '']
      );
    } else {
      await pool.query(
        `INSERT INTO unmatched_inbox
           (group_id, sender, message_id, name, size, mime_type, minio_key, received_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [groupId || '', sender || '', messageId || '', fileName,
         size, mimeType || '', minioKey, now]
      );
    }

    res.json({ received: true, minioKey, size, matched: Boolean(resolvedEngagementId) });
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
