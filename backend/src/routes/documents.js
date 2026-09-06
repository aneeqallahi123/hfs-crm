import { Router } from 'express';
import multer from 'multer';
import { pool } from '../db/pool.js';
import { rbac } from '../middleware/rbac.js';
import { uploadFile, getPresignedUrl, deleteFile } from '../storage/minio.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// POST /api/documents/upload
router.post('/upload', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large. Maximum size is 50 MB.' });
    }
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File required' });
  const { engagementId, itemId } = req.body;
  if (!engagementId) return res.status(400).json({ error: 'engagementId required' });

  try {
    const minioKey = await uploadFile(
      engagementId,
      req.file.originalname,
      req.file.buffer,
      req.file.mimetype
    );

    const now = new Date().toISOString();
    const { rows } = await pool.query(
      `INSERT INTO inbox_files
         (engagement_id, name, size, mime_type, minio_key, uploaded_at, received_at, source,
          assigned_item_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $6, 'manual', $7, $8)
       RETURNING *`,
      [
        engagementId, req.file.originalname, req.file.size,
        req.file.mimetype, minioKey, now,
        itemId || null,
        itemId ? 'Matched' : 'Unmatched',
      ]
    );

    if (itemId) {
      await pool.query(
        `UPDATE items SET file_note = $1, updated_at = NOW() WHERE id = $2`,
        [req.file.originalname, itemId]
      );
      // Write event
      const eng = await pool.query('SELECT client_id, module FROM engagements WHERE id=$1', [engagementId]);
      if (eng.rows[0]) {
        await pool.query(
          `INSERT INTO events (day, by, user_id, module, type, engagement_id, client_id, entity, entity_id, label, to_val)
           VALUES ($1, $2, $3, $4, 'file.uploaded', $5, $6, 'item', $7, $8, $9)`,
          [
            now.slice(0, 10), req.user.name, req.user.sub,
            eng.rows[0].module, engagementId, eng.rows[0].client_id,
            itemId, req.file.originalname, minioKey,
          ]
        );
      }
    }

    res.status(201).json({ file: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/documents/:fileId/download
router.get('/:fileId/download', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM inbox_files WHERE id = $1', [req.params.fileId]);
    if (!rows[0]) return res.status(404).json({ error: 'File not found' });

    // Student guard
    if (req.user.role === 'student') {
      const { rows: eng } = await pool.query(
        'SELECT incharge FROM engagements WHERE id = $1',
        [rows[0].engagement_id]
      );
      if (!eng[0] || eng[0].incharge !== req.user.name) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
    }

    const url = await getPresignedUrl(rows[0].minio_key);
    res.json({ url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/documents/:fileId
router.delete('/:fileId', rbac('partner', 'manager'), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM inbox_files WHERE id = $1', [req.params.fileId]);
    if (!rows[0]) return res.status(404).json({ error: 'File not found' });

    await deleteFile(rows[0].minio_key);
    await pool.query('DELETE FROM inbox_files WHERE id = $1', [req.params.fileId]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
