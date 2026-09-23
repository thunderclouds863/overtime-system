import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireManager } from '../auth.js';
import { sendEmail, templates } from '../mailer.js';

const router = Router();

const OFFICE = {
  lat: -6.192028366395371,
  lng: 106.73758715254144,
  radius: 100
};

function isHoliday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  return day === 0 || day === 6;
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function getManagerEmails() {
  try {
    const result = await query(
      "SELECT email FROM users WHERE role = 'manager' AND is_active = true AND email IS NOT NULL"
    );
    return result.rows.map(r => r.email).filter(Boolean);
  } catch (err) {
    console.error('getManagerEmails error:', err.message);
    return [];
  }
}

async function notifyAllManagers(templateName, data) {
  const emails = await getManagerEmails();
  console.log(`📨 notifyAllManagers: ${emails.length} manager`);
  if (emails.length === 0) {
    console.warn('⚠️ Tidak ada manager aktif');
    return 0;
  }
  let sent = 0;
  for (const email of emails) {
    const r = await sendEmail({ to: email, ...templates[templateName](data) });
    if (r.success) sent++;
  }
  return sent;
}

async function notifyUser(userId, templateName, data) {
  try {
    const result = await query('SELECT email FROM users WHERE id = $1', [userId]);
    const email = result.rows[0]?.email;
    if (!email) {
      console.warn(`⚠️ User ${userId} tidak punya email`);
      return 0;
    }
    const r = await sendEmail({ to: email, ...templates[templateName](data) });
    return r.success ? 1 : 0;
  } catch (err) {
    console.error('notifyUser error:', err.message);
    return 0;
  }
}

// ============================================
// GET /employees/list
// ============================================
router.get('/employees/list', requireAuth, requireManager, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, email, full_name, jabatan, level FROM users
       WHERE role = 'employee' AND is_active = true ORDER BY full_name`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// POST / — Buat pengajuan ATAU tugaskan
// ============================================
router.post('/', requireAuth, async (req, res) => {
  const {
    date, start_time, duration_hours,
    reason, description,
    employee_id, employee_name
  } = req.body;

  const user = req.user;
  const isManager = user.role === 'manager' || user.role === 'admin';

  if (!date || !duration_hours || !reason || !description) {
    return res.status(400).json({ error: 'Semua field wajib diisi' });
  }

  const holiday = isHoliday(date);
  const finalStartTime = start_time || (holiday ? '08:00' : '18:00');

  const plannedStart = new Date(`${date}T${finalStartTime}:00`);
  if (plannedStart < new Date()) {
    return res.status(400).json({ error: 'Jam mulai sudah terlewat' });
  }

  const targetId = isManager && employee_id ? employee_id : user.id;
  const targetName = isManager && employee_name ? employee_name : user.name;
  const initialStatus = isManager ? 'approved' : 'pending';

  // Approval chain = ID semua manager
  let approvalChainIds = [];
  if (!isManager) {
    try {
      const managersResult = await query(
        "SELECT id FROM users WHERE role = 'manager' AND is_active = true"
      );
      approvalChainIds = managersResult.rows.map(r => r.id);
      console.log(`📋 Approval chain: [${approvalChainIds.join(', ')}]`);
    } catch (err) {
      console.error('Get managers error:', err.message);
    }
  }

  try {
    const result = await query(
      `INSERT INTO overtime_records
       (employee_id, employee_name, date, start_time, planned_duration,
        planned_start, reason, description, source, status, is_holiday,
        approval_chain, approval_progress)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        targetId, targetName,
        date, finalStartTime,
        `${duration_hours} hours`,
        plannedStart.toISOString(),
        reason, description,
        isManager ? 'manager' : 'employee',
        initialStatus,
        holiday,
        approvalChainIds,
        0
      ]
    );

    const record = result.rows[0];
    console.log(`✅ Record created: ID=${record.id}, status=${record.status}, employee=${record.employee_name}, chain=[${approvalChainIds.join(',')}]`);

    let emailSent = 0;

    if (!isManager) {
      emailSent = await notifyAllManagers('newRequest', {
        employeeName: targetName,
        date, startTime: finalStartTime,
        duration: duration_hours,
        reason, desc: description
      });
    } else {
      emailSent = await notifyUser(targetId, 'approved', {
        date, startTime: finalStartTime
      });
    }

    res.json({ ...record, email_sent: emailSent });
  } catch (err) {
    console.error('POST /records error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// GET / — List records (FIXED: manager lihat semua)
// ============================================
router.get('/', requireAuth, async (req, res) => {
  const user = req.user;
  const { status, limit = 100 } = req.query;

  let sql = 'SELECT * FROM overtime_records';
  const params = [];
  let idx = 1;

  // Manager & admin: lihat SEMUA. Employee: hanya sendiri
  if (user.role !== 'manager' && user.role !== 'admin') {
    sql += ` WHERE employee_id = $1`;
    params.push(user.id);
    idx = 2;
  }

  if (status) {
    sql += params.length ? ' AND' : ' WHERE';
    sql += ` status = $${idx++}`;
    params.push(status);
  }

  sql += ` ORDER BY created_at DESC LIMIT $${idx}`;
  params.push(parseInt(limit));

  try {
    const result = await query(sql, params);
    console.log(`📋 GET /records: ${user.name} (${user.role}) → ${result.rows.length} records`);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /records error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// POST /:id/start — Mulai lembur (GPS)
// ============================================
router.post('/:id/start', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { lat, lng, accuracy } = req.body;
  const user = req.user;

  if (!lat || !lng) return res.status(400).json({ error: 'Koordinat GPS wajib' });

  const distance = Math.round(haversine(lat, lng, OFFICE.lat, OFFICE.lng));
  if (distance > OFFICE.radius) {
    return res.status(400).json({ error: `Di luar radius kantor (${distance}m > ${OFFICE.radius}m)` });
  }

  try {
    const result = await query(
      `UPDATE overtime_records
       SET status = 'active', actual_start = NOW(),
           gps_lat = $1, gps_lng = $2, gps_accuracy = $3, gps_distance = $4,
           auto_started = FALSE, updated_at = NOW()
       WHERE id = $5 AND (employee_id = $6 OR $7 IN ('manager', 'admin'))
         AND status = 'approved'
       RETURNING *`,
      [lat, lng, accuracy, distance, id, user.id, user.role]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Record tidak ditemukan / tidak bisa dimulai' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// POST /:id/finish — Selesai lembur + upload bukti
// ============================================
router.post('/:id/finish', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { proof_text, proof_file_name } = req.body;
  const user = req.user;

  if (!proof_text) return res.status(400).json({ error: 'Deskripsi bukti wajib' });

  try {
    const result = await query(
      `UPDATE overtime_records
       SET status = 'pending_verification', actual_end = NOW(),
           actual_duration = NOW() - actual_start,
           proof_text = $1, proof_file_name = $2, proof_uploaded_at = NOW(),
           updated_at = NOW()
       WHERE id = $3 AND (employee_id = $4 OR $5 IN ('manager', 'admin'))
         AND status = 'active'
       RETURNING *`,
      [proof_text, proof_file_name || null, id, user.id, user.role]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Record tidak ditemukan / tidak aktif' });

    const record = result.rows[0];
    console.log(`✅ Record ${record.id} selesai, kirim email ke manager`);

    const emailSent = await notifyAllManagers('proofSubmitted', {
      employeeName: record.employee_name,
      duration: record.actual_duration
    });

    res.json({ ...record, email_sent: emailSent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// POST /:id/cancel — Batalkan lembur
// ============================================
router.post('/:id/cancel', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const user = req.user;
  if (!reason) return res.status(400).json({ error: 'Alasan wajib' });
  try {
    const result = await query(
      `UPDATE overtime_records
       SET status = 'cancelled', cancel_reason = $1, cancelled_at = NOW(),
           actual_duration = NOW() - actual_start, updated_at = NOW()
       WHERE id = $2 AND (employee_id = $3 OR $4 IN ('manager', 'admin'))
         AND status = 'active'
       RETURNING *`,
      [reason, id, user.id, user.role]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Tidak ditemukan' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// POST /:id/revise — Revisi pengajuan
// ============================================
router.post('/:id/revise', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { reason, description, proof } = req.body;
  const user = req.user;
  if (!description) return res.status(400).json({ error: 'Deskripsi wajib' });
  try {
    const result = await query(
      `UPDATE overtime_records
       SET reason = $1, description = $2, proof_text = $3,
           status = 'pending', revision_count = revision_count + 1,
           approval_progress = 0, updated_at = NOW()
       WHERE id = $4 AND (employee_id = $5 OR $6 IN ('manager', 'admin'))
         AND status IN ('revision', 'rejected')
       RETURNING *`,
      [reason, description, proof || null, id, user.id, user.role]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Tidak bisa direvisi' });

    const record = result.rows[0];
    const emailSent = await notifyAllManagers('newRequest', {
      employeeName: user.name,
      date: record.date,
      startTime: record.start_time,
      duration: record.planned_duration,
      reason,
      desc: description
    });

    res.json({ ...record, email_sent: emailSent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// POST /:id/revise-proof — Revisi bukti
// ============================================
router.post('/:id/revise-proof', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { proof_text, proof_file_name } = req.body;
  const user = req.user;
  if (!proof_text) return res.status(400).json({ error: 'Deskripsi wajib' });
  try {
    const result = await query(
      `UPDATE overtime_records
       SET proof_text = $1, proof_file_name = $2, proof_uploaded_at = NOW(),
           status = 'pending_verification',
           proof_revision_count = proof_revision_count + 1, updated_at = NOW()
       WHERE id = $3 AND (employee_id = $4 OR $5 IN ('manager', 'admin'))
         AND status = 'proof_revision'
       RETURNING *`,
      [proof_text, proof_file_name || null, id, user.id, user.role]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Tidak ditemukan' });

    const record = result.rows[0];
    const emailSent = await notifyAllManagers('proofSubmitted', {
      employeeName: record.employee_name,
      duration: record.actual_duration
    });

    res.json({ ...record, email_sent: emailSent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
