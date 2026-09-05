import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

const COOKIE_NAME = 'hfc_refresh';
const COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  sameSite: 'none', // frontend and backend are on different domains; 'strict' blocks cross-site cookies
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7d in ms
};

function issueAccessToken(user) {
  return jwt.sign(
    { sub: user.id, name: user.name, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRY || '7d' }
  );
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE username = $1 AND active = true',
      [username]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const accessToken = issueAccessToken(user);

    // Create refresh token, store its hash
    const rawRefresh = uuidv4() + uuidv4();
    const tokenHash = await bcrypt.hash(rawRefresh, 10);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, tokenHash, expiresAt]
    );

    res.cookie(COOKIE_NAME, rawRefresh, COOKIE_OPTS);
    res.json({
      user: { id: user.id, name: user.name, role: user.role },
      accessToken,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  const rawRefresh = req.cookies?.[COOKIE_NAME];
  if (!rawRefresh) return res.status(401).json({ error: 'No refresh token' });

  try {
    // Find all non-expired tokens and check bcrypt match (can't query by hash directly)
    const { rows } = await pool.query(
      `SELECT rt.*, u.id as uid, u.name, u.role, u.active
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.expires_at > NOW()
       ORDER BY rt.created_at DESC
       LIMIT 100`
    );

    let matched = null;
    for (const row of rows) {
      if (await bcrypt.compare(rawRefresh, row.token_hash)) {
        matched = row;
        break;
      }
    }

    if (!matched || !matched.active) {
      res.clearCookie(COOKIE_NAME);
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const accessToken = issueAccessToken({ id: matched.uid, name: matched.name, role: matched.role });
    res.json({ accessToken });
  } catch (err) {
    console.error('Refresh error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  const rawRefresh = req.cookies?.[COOKIE_NAME];
  if (rawRefresh) {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM refresh_tokens WHERE expires_at > NOW() LIMIT 100'
      );
      for (const row of rows) {
        if (await bcrypt.compare(rawRefresh, row.token_hash)) {
          await pool.query('DELETE FROM refresh_tokens WHERE id = $1', [row.id]);
          break;
        }
      }
    } catch (err) {
      console.error('Logout cleanup error:', err);
    }
  }
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', verifyToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, username, role, active, created_at FROM users WHERE id = $1',
      [req.user.sub]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json({ user: rows[0] });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
