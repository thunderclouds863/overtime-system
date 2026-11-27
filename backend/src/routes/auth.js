import crypto from 'node:crypto';
import { Router } from 'express';
import { pool, query } from '../db.js';
import { hashPassword, verifyPassword, generateToken, requireAuth } from '../auth.js';
import { sendEmail, templates } from '../mailer.js';

const router = Router();
const RESET_TTL_MINUTES = 30;

function sha256(val) {
  return crypto.createHash('sha256').update(val).digest('hex');
}

router.post('/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!email || !password) {
    return res.status(400).json({ error: 'Email dan kata sandi wajib diisi' });
  }

  try {
    const result = await query('SELECT * FROM users WHERE LOWER(email) = $1', [email]);
    const user = result.rows[0];

    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Email atau kata sandi salah' });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'Akun tidak aktif. Hubungi admin.' });
    }

    res.json({
      token: generateToken(user),
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        jabatan: user.jabatan,
        level: user.level
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await query(
      'SELECT id, email, full_name, role, jabatan, level, is_active FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'User tidak ditemukan' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/change-password', requireAuth, async (req, res) => {
  const currentPassword = String(req.body?.current_password || '');
  const newPassword = String(req.body?.new_password || '');

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Kata sandi saat ini dan kata sandi baru wajib diisi' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Kata sandi baru minimal 6 karakter' });
  }
  if (currentPassword === newPassword) {
    return res.status(400).json({ error: 'Kata sandi baru tidak boleh sama dengan kata sandi lama' });
  }

  try {
    const result = await query('SELECT id, password_hash FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });
    if (!verifyPassword(currentPassword, user.password_hash)) {
      return res.status(400).json({ error: 'Kata sandi saat ini salah' });
    }

    await query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [hashPassword(newPassword), user.id]
    );
    res.json({ success: true, message: 'Kata sandi berhasil diperbarui' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/forgot-password', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Masukkan alamat email yang valid' });
  }

  // Always return a generic message so account existence cannot be enumerated
  const genericMsg = 'Jika email terdaftar dan aktif, tautan reset kata sandi telah dikirim.';

  try {
    const result = await query(
      'SELECT id, email, full_name, is_active FROM users WHERE LOWER(email) = $1',
      [email]
    );
    const user = result.rows[0];

    if (!user || !user.is_active) {
      return res.json({ success: true, message: genericMsg });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = sha256(rawToken);
    const expiresAt = new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000);

    await query(
      'UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL',
      [user.id]
    );
    await query(
      'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, tokenHash, expiresAt.toISOString()]
    );

    const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
    const appUrl = process.env.APP_URL || process.env.FRONTEND_URL || origin;
    const resetUrl = `${appUrl.replace(/\/$/, '')}/index.html?reset_token=${rawToken}`;

    const mailRes = await sendEmail({
      to: user.email,
      ...templates.passwordReset({
        fullName: user.full_name,
        resetUrl,
        expiresMinutes: RESET_TTL_MINUTES
      })
    });

    if (!mailRes.success) {
      console.log(`🔑 [RESET-DEV-LINK] ${user.email}: ${resetUrl}`);
    }

    res.json({ success: true, message: genericMsg });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/reset-password', async (req, res) => {
  const rawToken = String(req.body?.token || '').trim();
  const newPassword = String(req.body?.new_password || '');

  if (!rawToken) {
    return res.status(400).json({ error: 'Token reset wajib diisi' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Kata sandi baru minimal 6 karakter' });
  }

  const tokenHash = sha256(rawToken);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const tokenRes = await client.query(
      `SELECT t.id, t.user_id, t.expires_at, t.used_at, u.is_active
       FROM password_reset_tokens t
       JOIN users u ON u.id = t.user_id
       WHERE t.token_hash = $1
       FOR UPDATE`,
      [tokenHash]
    );
    const row = tokenRes.rows[0];

    if (!row || row.used_at || new Date(row.expires_at) < new Date() || !row.is_active) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Token reset tidak valid atau sudah kedaluwarsa' });
    }

    await client.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [hashPassword(newPassword), row.user_id]
    );
    await client.query(
      'UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1',
      [row.id]
    );
    await client.query('COMMIT');

    res.json({ success: true, message: 'Kata sandi berhasil diatur ulang. Silakan masuk.' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

export default router;
