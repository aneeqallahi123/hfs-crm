import { Router } from 'express';
import { pool } from '../db/pool.js';
import { rbac } from '../middleware/rbac.js';

const router = Router();

function toFile(row) {
  return {
    id: row.id,
    engagementId: row.engagement_id,
    name: row.name,
    size: row.size,
    mimeType: row.mime_type,
    minioKey: row.minio_key,
    uploadedAt: row.uploaded_at,
    receivedAt: row.received_at,
    source: row.source,
    sender: row.sender,
    messageId: row.message_id,
    groupId: row.group_id,
    status: row.status,
    assignedItemId: row.assigned_item_id,
    createdAt: row.created_at,
  };
}

// GET /api/inbox?engagementId=...
router.get('/', async (req, res) => {
  const { engagementId } = req.query;
  if (!engagementId) return res.status(400).json({ error: 'engagementId required' });

  try {
    if (req.user.role === 'student') {
      const { rows } = await pool.query(
        'SELECT incharge FROM engagements WHERE id = $1',
        [engagementId]
      );
      if (!rows[0] || rows[0].incharge !== req.user.name) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
    }

    const { rows } = await pool.query(
      'SELECT * FROM inbox_files WHERE engagement_id = $1 ORDER BY created_at DESC',
      [engagementId]
    );
    res.json({ files: rows.map(toFile) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/inbox/:fileId/assign
router.patch('/:fileId/assign', async (req, res) => {
  const { itemId } = req.body; // null to unassign
  try {
    const newStatus = itemId ? 'Matched' : 'Unmatched';
    const { rows } = await pool.query(
      `UPDATE inbox_files SET assigned_item_id = $1, status = $2 WHERE id = $3 RETURNING *`,
      [itemId || null, newStatus, req.params.fileId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'File not found' });

    // Update item file_note if assigning
    if (itemId) {
      await pool.query(
        `UPDATE items SET file_note = $1, updated_at = NOW() WHERE id = $2`,
        [rows[0].name, itemId]
      );
    }

    res.json({ file: toFile(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
