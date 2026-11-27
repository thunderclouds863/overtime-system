import { Router } from 'express';
import { query } from '../db.js';
import { hashPassword, requireAuth, requireAdmin, requireReviewer, levelNum } from '../auth.js';
import { sendEmail, templates } from '../mailer.js';

const router = Router();

function getAllowedDomains() {
  const base = ['gmail.com', 'cimory.com'];
  if (process.env.DEMO_MODE === '1') base.push('demo.local');
  if (process.env.ALLOWED_EMAIL_DOMAINS) {
    process.env.ALLOWED_EMAIL_DOMAINS.split(',').forEach(d => {
      const clean = d.trim().toLowerCase();
      if (clean && !base.includes(clean)) base.push(clean);
    });
  }
  return base;
}

// ============================================
// USER MANAGEMENT (hanya admin)
// ============================================

router.get('/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.email, u.full_name, u.role, u.jabatan, u.level,
              u.is_active, u.created_at, u.approver_ids,
              COALESCE(
                (SELECT json_agg(json_build_object('id', a.id, 'full_name', a.full_name, 'level', a.level))
                 FROM users a WHERE a.id = ANY(u.approver_ids)),
                '[]'::json
              ) as approvers
       FROM users u ORDER BY u.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/users', requireAuth, requireAdmin, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const full_name = String(req.body?.full_name || '').trim();
  const role = req.body?.role;
  const jabatan = req.body?.jabatan ? String(req.body.jabatan).trim() : null;
  const level = req.body?.level || null;
  const approver_ids = Array.isArray(req.body?.approver_ids) ? req.body.approver_ids : [];

  if (!email || !password || !full_name || !role) {
    return res.status(400).json({ error: 'Semua field wajib diisi' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Kata sandi minimal 6 karakter' });
  }
  if (!['employee', 'manager', 'admin', 'reviewer'].includes(role)) {
    return res.status(400).json({ error: 'Role tidak valid' });
  }

  const parts = email.split('@');
  const domain = parts.length === 2 ? parts[1] : '';
  if (!domain || !getAllowedDomains().includes(domain)) {
    return res.status(400).json({ error: 'Domain email tidak diizinkan' });
  }

  try {
    const existing = await query('SELECT id FROM users WHERE LOWER(email) = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email sudah terdaftar' });
    }

    const hash = hashPassword(password);
    const result = await query(
      `INSERT INTO users (email, password_hash, full_name, role, jabatan, level, approver_ids, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, email, full_name, role, jabatan, level, approver_ids, is_active, created_at`,
      [email, hash, full_name, role, jabatan, level, approver_ids, req.user.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { full_name, role, jabatan, is_active, password, level, approver_ids } = req.body;

  if (password !== undefined && password !== '' && String(password).length < 6) {
    return res.status(400).json({ error: 'Kata sandi minimal 6 karakter' });
  }
  if (parseInt(id, 10) === req.user.id && is_active === false) {
    return res.status(400).json({ error: 'Tidak bisa menonaktifkan akun sendiri' });
  }

  try {
    let sql = `UPDATE users SET updated_at = NOW()`;
    const params = [];
    let idx = 1;

    if (full_name && String(full_name).trim()) { sql += `, full_name = $${idx++}`; params.push(String(full_name).trim()); }
    if (role) {
      if (!['employee', 'manager', 'admin', 'reviewer'].includes(role)) {
        return res.status(400).json({ error: 'Role tidak valid' });
      }
      sql += `, role = $${idx++}`; params.push(role);
    }
    if (jabatan !== undefined) { sql += `, jabatan = $${idx++}`; params.push(jabatan ? String(jabatan).trim() : null); }
    if (is_active !== undefined) { sql += `, is_active = $${idx++}`; params.push(Boolean(is_active)); }
    if (password) { sql += `, password_hash = $${idx++}`; params.push(hashPassword(String(password))); }
    if (level !== undefined) { sql += `, level = $${idx++}`; params.push(level); }
    if (approver_ids !== undefined) { sql += `, approver_ids = $${idx++}`; params.push(Array.isArray(approver_ids) ? approver_ids : []); }

    sql += ` WHERE id = $${idx} RETURNING id, email, full_name, role, jabatan, level, approver_ids, is_active`;
    params.push(id);

    const result = await query(sql, params);
    if (!result.rows[0]) return res.status(404).json({ error: 'User tidak ditemukan' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  if (parseInt(id, 10) === req.user.id) {
    return res.status(400).json({ error: 'Tidak bisa hapus akun sendiri' });
  }
  try {
    const result = await query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User tidak ditemukan' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/approvers', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, email, full_name, level, role, jabatan FROM users
       WHERE is_active = true AND role IN ('manager', 'admin')
       ORDER BY level DESC NULLS LAST, full_name`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// RECORDS — admin & reviewer
// ============================================
router.get('/records', requireAuth, requireReviewer, async (req, res) => {
  const { status, start_date, end_date, employee_id, limit = 500 } = req.query;
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 500, 1), 2000);

  try {
    let sql = `
      SELECT r.*,
        u.email as employee_email,
        u.jabatan,
        u.level as employee_level,
        COALESCE(ap.full_name, ap2.full_name) as approver_name,
        ROUND(COALESCE(EXTRACT(EPOCH FROM r.planned_duration), 0) / 3600.0, 2) as planned_hours,
        ROUND(COALESCE(EXTRACT(EPOCH FROM r.actual_duration), 0) / 3600.0, 2) as actual_hours
      FROM overtime_records r
      LEFT JOIN users u ON u.id = r.employee_id
      LEFT JOIN users ap ON ap.id = r.approved_by
      LEFT JOIN users ap2 ON ap2.id = r.final_approver_id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (status) { sql += ` AND r.status = $${idx++}`; params.push(status); }
    if (start_date) { sql += ` AND r.date >= $${idx++}`; params.push(start_date); }
    if (end_date) { sql += ` AND r.date <= $${idx++}`; params.push(end_date); }
    if (employee_id) { sql += ` AND r.employee_id = $${idx++}`; params.push(employee_id); }

    sql += ` ORDER BY r.date DESC, r.created_at DESC LIMIT $${idx}`;
    params.push(safeLimit);

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// STATS — admin & reviewer
// ============================================
router.get('/stats', requireAuth, requireReviewer, async (req, res) => {
  try {
    const totalUsers = await query('SELECT COUNT(*) FROM users WHERE is_active = true');
    const totalRecords = await query('SELECT COUNT(*) FROM overtime_records');
    const activeNow = await query("SELECT COUNT(*) FROM overtime_records WHERE status = 'active'");
    const pendingApproval = await query("SELECT COUNT(*) FROM overtime_records WHERE status = 'pending'");
    const pendingVerify = await query("SELECT COUNT(*) FROM overtime_records WHERE status = 'pending_verification'");

    const completedMonth = await query(`
      SELECT COALESCE(SUM(EXTRACT(EPOCH FROM actual_duration))/3600, 0) as total_hours
      FROM overtime_records
      WHERE status IN ('completed', 'pending_verification')
        AND actual_duration IS NOT NULL
        AND date_trunc('month', date) = date_trunc('month', (NOW() AT TIME ZONE 'Asia/Jakarta')::date)
    `);

    res.json({
      total_users: parseInt(totalUsers.rows[0].count, 10),
      total_records: parseInt(totalRecords.rows[0].count, 10),
      active_now: parseInt(activeNow.rows[0].count, 10),
      pending_approval: parseInt(pendingApproval.rows[0].count, 10),
      pending_verify: parseInt(pendingVerify.rows[0].count, 10),
      hours_this_month: parseFloat(completedMonth.rows[0].total_hours).toFixed(1)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/reviewers', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, email, full_name FROM users WHERE role = 'reviewer' AND is_active = true ORDER BY full_name`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// POST /records/:id/remind — Kirim reminder ke approver/verifikator
// ============================================
router.post('/records/:id/remind', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const recRes = await query(
      `SELECT r.*,
        ROUND(COALESCE(EXTRACT(EPOCH FROM r.planned_duration), 0) / 3600.0, 2) as planned_hours,
        ROUND(COALESCE(EXTRACT(EPOCH FROM r.actual_duration), 0) / 3600.0, 2) as actual_hours
       FROM overtime_records r WHERE r.id = $1`,
      [id]
    );
    const record = recRes.rows[0];
    if (!record) return res.status(404).json({ error: 'Record tidak ditemukan' });

    const needsApproval = record.status === 'pending' || (record.status === 'active' && !record.final_approver_id);
    const needsVerify = record.status === 'pending_verification';

    if (!needsApproval && !needsVerify) {
      return res.status(400).json({ error: 'Reminder hanya tersedia untuk status menunggu approval atau menunggu verifikasi' });
    }

    let targets = [];
    const chain = record.approval_chain || [];

    if (needsApproval) {
      if (chain.length > 0) {
        const approversRes = await query(
          'SELECT id, email, full_name, level FROM users WHERE id = ANY($1) AND is_active = true',
          [chain]
        );
        const ordered = chain.map(cid => approversRes.rows.find(u => u.id === cid)).filter(Boolean);
        if (!record.direct_approver_id) {
          targets = ordered;
        } else {
          targets = ordered.filter(u => levelNum(u.level) >= 4);
        }
      }
      if (targets.length === 0) {
        const fallback = await query(
          "SELECT id, email, full_name, level FROM users WHERE role = 'manager' AND is_active = true"
        );
        targets = fallback.rows;
      }
    } else if (needsVerify) {
      if (record.final_approver_id) {
        const finalRes = await query(
          'SELECT id, email, full_name, level FROM users WHERE id = $1 AND is_active = true',
          [record.final_approver_id]
        );
        targets = finalRes.rows;
      }
      if (targets.length === 0 && chain.length > 0) {
        const chainRes = await query(
          'SELECT id, email, full_name, level FROM users WHERE id = ANY($1) AND is_active = true',
          [chain]
        );
        targets = chainRes.rows.filter(u => levelNum(u.level) >= 4);
      }
      if (targets.length === 0) {
        const fallback = await query(
          "SELECT id, email, full_name, level FROM users WHERE role = 'manager' AND is_active = true"
        );
        targets = fallback.rows;
      }
    }

    let emailSent = 0;
    const recipientNames = [];
    for (const t of targets) {
      if (!t.email) continue;
      recipientNames.push(`${t.full_name} (${t.email})`);
      const tpl = needsApproval
        ? templates.reminderApproval({
            employeeName: record.employee_name,
            date: record.date,
            startTime: record.start_time,
            duration: record.planned_hours || 0,
            reason: record.reason,
            desc: record.description,
            statusNote: record.status === 'active' ? 'Lembur sedang berjalan (belum di-approve)' : 'Menunggu persetujuan'
          })
        : templates.reminderVerification({
            employeeName: record.employee_name,
            date: record.date,
            duration: record.actual_hours ? `${parseFloat(record.actual_hours).toFixed(2)} jam` : '-',
            proof: record.proof_text || '(Bukti belum diunggah karyawan)'
          });
      const r = await sendEmail({ to: t.email, ...tpl });
      if (r.success) emailSent++;
    }

    await query(
      `INSERT INTO activity_logs (record_id, actor_id, actor_name, action, details)
       VALUES ($1, $2, $3, 'admin_reminder', $4)`,
      [
        record.id,
        req.user.id,
        req.user.name || 'Admin',
        JSON.stringify({
          type: needsApproval ? 'approval' : 'verification',
          recipients: recipientNames,
          email_sent: emailSent
        })
      ]
    );

    res.json({
      success: true,
      target_type: needsApproval ? 'approval' : 'verification',
      recipients: recipientNames,
      email_sent: emailSent,
      message: recipientNames.length > 0
        ? `Reminder dikirim ke ${recipientNames.map(n => n.split(' (')[0]).join(', ')}`
        : 'Tidak ada approver aktif yang ditemukan'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
