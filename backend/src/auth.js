import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-me-in-production-min-32-chars';

export function hashPassword(pw) {
  return bcrypt.hashSync(pw, 10);
}

export function verifyPassword(pw, hash) {
  return bcrypt.compareSync(pw, hash);
}

export function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.full_name,
      level: user.level
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token tidak ada' });
  }
  try {
    const token = header.split(' ')[1];
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token tidak valid' });
  }
}

export function requireManager(req, res, next) {
  const level = levelNum(req.user?.level);
  const allowedRoles = ['manager', 'admin'];
  
  if (allowedRoles.includes(req.user?.role) || level >= 3) {
    return next();
  }
  return res.status(403).json({ error: 'Akses hanya untuk atasan (level 3+)' });
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Akses hanya untuk admin' });
  }
  next();
}

export function requireReviewer(req, res, next) {
  const allowed = ['admin', 'reviewer'];
  if (!allowed.includes(req.user?.role)) {
    return res.status(403).json({ error: 'Akses hanya untuk reviewer' });
  }
  next();
}

function levelNum(level) {
  if (!level) return 0;
  const m = String(level).match(/^(\d+)/);
  return m ? parseInt(m[1]) : 0;
}
