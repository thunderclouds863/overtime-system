import { Router } from 'express';
import { query } from '../db.js';
import { hashPassword, requireAuth, requireAdmin, requireReviewer } from '../auth.js';
import { sendEmail, templates } from '../mailer.js';

const router = Router();

function levelNum(level) {
  if (!level) return 0;
  const m = String(level).match(/^(\d+)/);
  return m ? parseInt(m[1]) : 0;
}

async function notifyUser(userId, templateName, data) {
  try {
    const result = await query('SELECT email FROM users WHERE id = $1', [userId]);
    const email = result.rows[0]?.email;
    if (!email) return 0;
    const r = await sendEmail({ to: email, ...templates[templateName](data) });
    return r.success ? 1 : 0;
  } catch (err) {
    console.error('notifyUser error:', err.message);
    return 0;
  }
}

// ============================================
// USER MANAGEMENT
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
  const { email, password, full_name, role, jabatan, level, approver_ids } = req.body;

  if (!email || !password || !full_name || !role) {
    return res.status(400).json({ error: 'Semua field wajib' });
  }

  if (!['employee', 'manager', 'admin', 'reviewer'].includes(role)) {
    return res.status(400).json({ error: 'Role tidak valid' });
  }

  const domain = email.split('@')[1]?.toLowerCase();
  if (!['gmail.com', 'cimory.com'].includes(domain)) {
    return res.status(400).json({ error: 'Domain email tidak diizinkan' });
  }

  try {
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email sudah terdaftar' });
    }

    const hash = hashPassword(password);
    const result = await query(
      `INSERT INTO users (email, password_hash, full_name, role, jabatan, level, approver_ids, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, email, full_name, role, jabatan, level, approver_ids, is_active, created_at`,
      [email, hash, full_name, role, jabatan || null, level || null, approver_ids || [], req.user.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { full_name, role, jabatan, is_active, password, level, approver_ids } = req.body;

  try {
    let sql = `UPDATE users SET updated_at = NOW()`;
    const params = [];
    let idx = 1;

    if (full_name) { sql += `, full_name = $${idx++}`; params.push(full_name); }
    if (role) {
      if (!['employee', 'manager', 'admin', 'reviewer'].includes(role)) {
        return res.status(400).json({ error: 'Role tidak valid' });
      }
      sql += `, role = $${idx++}`; params.push(role);
    }
    if (jabatan !== undefined) { sql += `, jabatan = $${idx++}`; params.push(jabatan); }
    if (is_active !== undefined) { sql += `, is_active = $${idx++}`; params.push(is_active); }
    if (password) { sql += `, password_hash = $${idx++}`; params.push(hashPassword(password)); }
    if (level !== undefined) { sql += `, level = $${idx++}`; params.push(level); }
    if (approver_ids !== undefined) { sql += `, approver_ids = $${idx++}`; params.push(approver_ids); }

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
  if (parseInt(id) === req.user.id) {
    return res.status(400).json({ error: 'Tidak bisa hapus akun sendiri' });
  }
  try {
    await query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/approvers', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, email, full_name, level, role FROM users
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
    params.push(parseInt(limit));

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// ADMIN APPROVE PENDING
// ============================================
router.post('/records/:id/admin-approve', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { note } = req.body;

  try {
    const recordResult = await query('SELECT * FROM overtime_records WHERE id = $1', [id]);
    const record = recordResult.rows[0];

    if (!record) return res.status(404).json({ error: 'Record tidak ditemukan' });
    if (record.status !== 'pending') {
      return res.status(400).json({ error: `Record bukan pending (status: ${record.status})` });
    }

    // Admin approve = langsung final approve
    await query(
      `UPDATE overtime_records
       SET status = 'approved',
           approved_by = $1, approved_at = NOW(),
           final_approver_id = $1, final_approval_at = NOW(),
           approval_note = $2, updated_at = NOW()
       WHERE id = $3`,
      [req.user.id, note || `Disetujui oleh admin (${req.user.name})`, id]
    );

    console.log(`✅ Admin ${req.user.name} approve record ${id}`);

    // Notif ke employee
    await notifyUser(record.employee_id, 'approved', {
      date: record.date,
      startTime: record.start_time,
      finalApproverName: req.user.name,
      reason: record.reason,
      desc: record.description
    });

    res.json({ success: true, message: 'Lembur disetujui oleh admin' });
  } catch (err) {
    console.error('admin-approve error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/records/:id/admin-reject', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { note } = req.body;

  if (!note) return res.status(400).json({ error: 'Alasan wajib diisi' });

  try {
    const recordResult = await query('SELECT * FROM overtime_records WHERE id = $1', [id]);
    const record = recordResult.rows[0];

    if (!record) return res.status(404).json({ error: 'Record tidak ditemukan' });
    if (record.status !== 'pending') {
      return res.status(400).json({ error: `Record bukan pending (status: ${record.status})` });
    }

    await query(
      `UPDATE overtime_records
       SET status = 'rejected',
           approval_note = $1, rejected_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [`Ditolak admin (${req.user.name}): ${note}`, id]
    );

    console.log(`❌ Admin ${req.user.name} reject record ${id}`);

    await notifyUser(record.employee_id, 'rejected', {
      date: record.date,
      startTime: record.start_time,
      note: note,
      rejectedBy: req.user.name,
      reason: record.reason,
      desc: record.description
    });

    res.json({ success: true, message: 'Lembur ditolak oleh admin' });
  } catch (err) {
    console.error('admin-reject error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// STATS
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
        AND date_trunc('month', date) = date_trunc('month', CURRENT_DATE)
    `);

    res.json({
      total_users: parseInt(totalUsers.rows[0].count),
      total_records: parseInt(totalRecords.rows[0].count),
      active_now: parseInt(activeNow.rows[0].count),
      pending_approval: parseInt(pendingApproval.rows[0].count),
      pending_verify: parseInt(pendingVerify.rows[0].count),
      hours_this_month: parseFloat(completedMonth.rows[0].total_hours).toFixed(1)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
