import jwt from 'jsonwebtoken';

export function verifyToken(req, res, next) {
  const header = req.headers.authorization;
  // Also accept ?token= query param for direct browser navigation (e.g. file downloads)
  const token = header?.startsWith('Bearer ') ? header.slice(7) : req.query.token;
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
