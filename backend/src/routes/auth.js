import { Router } from 'express';
import { query } from '../db.js';
import { hashPassword, verifyPassword, generateToken } from '../auth.js';

const router = Router();

// Daftar domain yang diizinkan
const ALLOWED_DOMAINS = ['gmail.com', 'cimory.com'];

router.post('/register', async (req, res) => {
  const { email, password, full_name, role } = req.body;

  if (!email || !password || !full_name) {
    return res.status(400).json({ error: 'Semua field wajib' });
  }

  const domain = email.split('@')[1]?.toLowerCase();
  if (!ALLOWED_DOMAINS.includes(domain)) {
    return res.status(400).json({ error: 'Domain email tidak diizinkan' });
  }

  try {
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email sudah terdaftar' });
    }

    const hash = hashPassword(password);
    const result = await query(
      `INSERT INTO users (email, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, full_name, role`,
      [email, hash, full_name, role || 'employee']
    );

    const user = result.rows[0];
    res.json({ token: generateToken(user), user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Email atau password salah' });
    }

    res.json({
      token: generateToken(user),
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ambil daftar manager untuk notifikasi
router.get('/managers', requireAuth, async (req, res) => {
  const result = await query(
    "SELECT id, email, full_name FROM users WHERE role = 'manager'"
  );
  res.json(result.rows);
});

export default router;