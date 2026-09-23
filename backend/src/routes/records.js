import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../db.js';
import { requireAuth, requireManager } from '../auth.js';
import { sendEmail, templates } from '../mailer.js';

const router = Router();

const OFFICE = {
  lat: -6.192028366395371,
  lng: 106.73758715254144,
  radius: 100
};

const SUBMIT_DEADLINE_HOUR = 18;
const START_HOUR_WEEKDAY = 17;
const START_HOUR_HOLIDAY = 8;
const MIN_OVERTIME_HOURS = 1;

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

async function notifyUser(userId, templateName, data) {
  try {
    const result = await query('SELECT email FROM users WHERE id = $1', [userId]);
    const email = result.rows[0]?.email;
    if (!email) {
      console.warn(`⚠️ notifyUser: user ${userId} tidak punya email`);
      return 0;
    }
    const r = await sendEmail({ to: email, ...templates[templateName](data) });
    return r.success ? 1 : 0;
  } catch (err) {
    console.error('notifyUser error:', err.message);
    return 0;
  }
}

async function notifyAllManagers(templateName, data) {
  try {
    const result = await query(
      "SELECT email FROM users WHERE role = 'manager' AND is_active = true AND email IS NOT NULL"
    );
    let sent = 0;
    for (const row of result.rows) {
      const r = await sendEmail({ to: row.email, ...templates[templateName](data) });
      if (r.success) sent++;
    }
    console.log(`📨 notifyAllManagers(${templateName}): ${sent} terkirim`);
    return sent;
  } catch (err) {
    console.error('notifyAllManagers error:', err.message);
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
// POST / — Buat pengajuan (employee) ATAU tugaskan (manager)
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

  const durationNum = parseInt(duration_hours);
  if (!durationNum || durationNum < 1) {
    return res.status(400).json({ error: 'Durasi minimal 1 jam' });
  }

  const holiday = isHoliday(date);
  const now = new Date();

  const todayStr = now.toISOString().slice(0, 10);
  const isToday = date === todayStr;

  if (isToday && now.getHours() >= SUBMIT_DEADLINE_HOUR) {
    return res.status(400).json({
      error: `Batas pengajuan untuk hari ini sudah lewat (maks jam ${SUBMIT_DEADLINE_HOUR}:00).`
    });
  }

  const defaultHour = holiday ? START_HOUR_HOLIDAY : START_HOUR_WEEKDAY;
  const finalStartTime = start_time || `${String(defaultHour).padStart(2, '0')}:00`;

  const plannedStart = new Date(`${date}T${finalStartTime}:00`);

  if (isToday && plannedStart < now) {
    return res.status(400).json({ error: 'Jam mulai sudah terlewat' });
  }

  const targetId = isManager && employee_id ? employee_id : user.id;
  const targetName = isManager && employee_name ? employee_name : user.name;
  const initialStatus = isManager ? 'approved' : 'pending';

  let approvalChainIds = [];
  if (!isManager) {
    try {
      const managersResult = await query(
        "SELECT id FROM users WHERE role = 'manager' AND is_active = true"
      );
      approvalChainIds = managersResult.rows.map(r => r.id);
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
        `${durationNum} hours`,
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
    console.log(`✅ Record created: ID=${record.id}, status=${record.status}, source=${record.source}, employee=${record.employee_name}`);

    let emailSent = 0;

    // ==========================================
    // KIRIM EMAIL
    // ==========================================
    if (!isManager) {
      // === A. EMPLOYEE AJUKAN ===
      const managersResult = await query(
        "SELECT id, email FROM users WHERE role = 'manager' AND is_active = true AND email IS NOT NULL"
      );

      const JWT_SECRET = process.env.JWT_SECRET;
      const BACKEND_URL = process.env.BACKEND_URL || 'https://overtime-backend-wd4c.onrender.com';

      for (const mgr of managersResult.rows) {
        const approveToken = jwt.sign(
          { recordId: record.id, action: 'approve', managerId: mgr.id },
          JWT_SECRET,
          { expiresIn: '24h' }
        );
        const rejectToken = jwt.sign(
          { recordId: record.id, action: 'reject', managerId: mgr.id },
          JWT_SECRET,
          { expiresIn: '24h' }
        );

        const r = await sendEmail({
          to: mgr.email,
          ...templates.newRequest({
            employeeName: targetName,
            date, startTime: finalStartTime,
            duration: durationNum,
            reason, desc: description,
            approveUrl: `${BACKEND_URL}/api/approval/email-action?token=${approveToken}`,
            rejectUrl: `${BACKEND_URL}/api/approval/email-action?token=${rejectToken}`
          })
        });
        if (r.success) emailSent++;
      }

      const fyiSent = await notifyUser(record.employee_id, 'pendingApproval', {
        date, startTime: finalStartTime,
        duration: durationNum,
        managerName: 'Atasan'
      });
      emailSent += fyiSent;

    } else {
      // === D. MANAGER TUGASKAN LEMBUR ===
      const assignedSent = await notifyUser(targetId, 'assigned', {
        managerName: user.name,
        date, startTime: finalStartTime,
        duration: durationNum,
        reason, desc: description
      });
      emailSent += assignedSent;

      const fyiSent = await notifyUser(user.id, 'assignedFyiManager', {
        employeeName: targetName,
        date, startTime: finalStartTime,
        duration: durationNum
      });
      emailSent += fyiSent;
    }

    res.json({ ...record, email_sent: emailSent });
  } catch (err) {
    console.error('POST /records error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// GET / — List records (admin, manager, reviewer lihat semua)
// ============================================
router.get('/', requireAuth, async (req, res) => {
  const user = req.user;
  const { status, limit = 100 } = req.query;

  let sql = `
    SELECT *,
      ROUND(COALESCE(EXTRACT(EPOCH FROM planned_duration), 0) / 3600.0, 2) as planned_hours,
      ROUND(COALESCE(EXTRACT(EPOCH FROM actual_duration), 0) / 3600.0, 2) as actual_hours
    FROM overtime_records
  `;
  const params = [];
  let idx = 1;

  // Employee hanya lihat record sendiri. Manager, admin, reviewer lihat semua.
  if (!['manager', 'admin', 'reviewer'].includes(user.role)) {
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
// POST /:id/start — Mulai lembur manual (GPS)
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

    const record = result.rows[0];
    console.log(`▶️ Record ${id} started manual by ${user.name}`);

    // FYI ke employee
    await notifyUser(record.employee_id, 'startedEmployee', {
      date: record.date,
      startTime: record.start_time,
      duration: Math.round(parseFloat(record.planned_duration?.split(':')[0] || 2)),
      employeeName: record.employee_name
    });

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// POST /:id/auto-stop — Auto stop keluar radius
// ============================================
router.post('/:id/auto-stop', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { lat, lng, reason } = req.body;
  const user = req.user;

  if (!lat || !lng) return res.status(400).json({ error: 'Koordinat GPS wajib' });

  const distance = Math.round(haversine(lat, lng, OFFICE.lat, OFFICE.lng));
  console.log(`🚨 AUTO-STOP: record=${id}, distance=${distance}m, user=${user.name}`);

  try {
    // Cek dulu record masih active
    const checkResult = await query(
      'SELECT id, employee_name, employee_id, status FROM overtime_records WHERE id = $1',
      [id]
    );
    const existing = checkResult.rows[0];

    if (!existing) {
      return res.status(404).json({ error: 'Record tidak ditemukan' });
    }
    if (existing.status !== 'active') {
      console.warn(`⚠️ Auto-stop: record ${id} bukan active (status: ${existing.status})`);
      return res.status(400).json({ 
        error: `Record sudah tidak aktif (status: ${existing.status})`,
        already_stopped: true
      });
    }

    // Update: pastikan actual_duration tidak NULL
    const result = await query(
      `UPDATE overtime_records
       SET status = 'cancelled',
           cancel_reason = $1,
           cancelled_at = NOW(),
           actual_end = NOW(),
           actual_duration = GREATEST(NOW() - actual_start, INTERVAL '1 second'),
           gps_lat = $2, gps_lng = $3, gps_distance = $4,
           updated_at = NOW()
       WHERE id = $5
         AND employee_id = $6
         AND status = 'active'
       RETURNING *`,
      [
        reason || `Keluar radius kantor (${distance}m)`,
        lat, lng, distance,
        id, user.id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Record tidak bisa di-auto-stop' });
    }

    const record = result.rows[0];
    console.log(`✅ Record ${id} AUTO-STOPPED: ${record.employee_name}`);

    const stoppedAt = new Date().toLocaleString('id-ID');
    const reasonText = reason || `Keluar radius kantor (${distance}m)`;

    // Email ke EMPLOYEE (ACTION)
    await notifyUser(record.employee_id, 'autoStopEmployee', {
      reason: reasonText,
      distance,
      stoppedAt
    });

    // Email ke semua MANAGER (FYI)
    await notifyAllManagers('autoStopManager', {
      employeeName: record.employee_name,
      distance,
      stoppedAt,
      reason: reasonText
    });

    res.json(record);
  } catch (err) {
    console.error('auto-stop error:', err.message);
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
    const recordCheck = await query(
      'SELECT actual_start, employee_name, employee_id, date, status FROM overtime_records WHERE id = $1',
      [id]
    );
    const rec = recordCheck.rows[0];
    if (!rec || !rec.actual_start) {
      return res.status(404).json({ error: 'Record tidak ditemukan / belum dimulai' });
    }
    if (rec.status !== 'active') {
      return res.status(400).json({ error: `Record tidak dalam status aktif (status: ${rec.status})` });
    }

    const durationMs = Date.now() - new Date(rec.actual_start).getTime();
    const durationHours = durationMs / 3600000;

    console.log(`⏱ Durasi aktual: ${durationHours.toFixed(2)} jam (min: ${MIN_OVERTIME_HOURS} jam)`);

    // ==========================================
    // KASUS A: DURASI < 1 JAM → TIDAK DIHITUNG
    // ==========================================
    if (durationHours < MIN_OVERTIME_HOURS) {
      const result = await query(
        `UPDATE overtime_records
         SET status = 'cancelled',
             cancel_reason = $1,
             cancelled_at = NOW(),
             actual_end = NOW(),
             actual_duration = GREATEST(NOW() - actual_start, INTERVAL '1 second'),
             proof_text = $2,
             proof_file_name = $3,
             proof_uploaded_at = NOW(),
             updated_at = NOW()
         WHERE id = $4
           AND (employee_id = $5 OR $6 IN ('manager', 'admin'))
           AND status = 'active'
         RETURNING *`,
        [
          `Durasi kurang dari ${MIN_OVERTIME_HOURS} jam (${durationHours.toFixed(2)} jam) — tidak dihitung lembur`,
          proof_text,
          proof_file_name || null,
          id, user.id, user.role
        ]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Record tidak ditemukan / tidak aktif' });
      }

      const record = result.rows[0];
      const reasonText = `Durasi ${durationHours.toFixed(2)} jam < 1 jam — tidak dihitung lembur`;
      console.log(`❌ Record ${id} TIDAK DIHITUNG: ${reasonText}`);

      // Email ke EMPLOYEE (ACTION)
      await notifyUser(record.employee_id, 'notCountedEmployee', {
        employeeName: record.employee_name,
        date: record.date,
        duration: `${durationHours.toFixed(2)} jam`,
        reason: reasonText
      });

      // Email ke semua MANAGER (FYI)
      await notifyAllManagers('notCountedManager', {
        employeeName: record.employee_name,
        date: record.date,
        duration: `${durationHours.toFixed(2)} jam`,
        reason: reasonText
      });

      return res.json({
        ...record,
        not_counted: true,
        message: reasonText
      });
    }

    // ==========================================
    // KASUS B: DURASI >= 1 JAM → NORMAL
    // ==========================================
    const result = await query(
      `UPDATE overtime_records
       SET status = 'pending_verification',
           actual_end = NOW(),
           actual_duration = GREATEST(NOW() - actual_start, INTERVAL '1 second'),
           proof_text = $1,
           proof_file_name = $2,
           proof_uploaded_at = NOW(),
           updated_at = NOW()
       WHERE id = $3
         AND (employee_id = $4 OR $5 IN ('manager', 'admin'))
         AND status = 'active'
       RETURNING *`,
      [proof_text, proof_file_name || null, id, user.id, user.role]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Record tidak ditemukan / tidak aktif' });
    }

    const record = result.rows[0];
    const durationStr = `${durationHours.toFixed(2)} jam`;
    const submittedAt = new Date().toLocaleString('id-ID');
    console.log(`✅ Record ${id} selesai, durasi ${durationStr}`);

    // Email ke MANAGER (ACTION)
    const mgrSent = await notifyAllManagers('proofSubmitted', {
      employeeName: record.employee_name,
      duration: durationStr,
      proof: proof_text
    });

    // Email ke EMPLOYEE (FYI)
    const empSent = await notifyUser(record.employee_id, 'proofPendingFyi', {
      duration: durationStr,
      submittedAt
    });

    res.json({ ...record, email_sent: mgrSent + empSent, not_counted: false });
  } catch (err) {
    console.error('finish error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// POST /:id/cancel — Batalkan lembur manual
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
           actual_end = NOW(),
           actual_duration = GREATEST(NOW() - actual_start, INTERVAL '1 second'),
           updated_at = NOW()
       WHERE id = $2 AND (employee_id = $3 OR $4 IN ('manager', 'admin'))
         AND status = 'active'
       RETURNING *`,
      [reason, id, user.id, user.role]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Tidak ditemukan / tidak aktif' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// POST /:id/revise — Revisi pengajuan (employee)
// ============================================
router.post('/:id/revise', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { date, start_time, duration_hours, reason, description, proof } = req.body;
  const user = req.user;

  if (!description) return res.status(400).json({ error: 'Deskripsi wajib' });

  try {
    const existing = await query('SELECT * FROM overtime_records WHERE id = $1', [id]);
    const record = existing.rows[0];

    if (!record) return res.status(404).json({ error: 'Record tidak ditemukan' });
    if (!['revision', 'rejected'].includes(record.status)) {
      return res.status(400).json({ error: 'Hanya bisa revisi yang statusnya REVISI atau DITOLAK' });
    }
    if (record.employee_id !== user.id && !['manager', 'admin'].includes(user.role)) {
      return res.status(403).json({ error: 'Bukan record kamu' });
    }

    const finalDate = date || record.date;
    const holiday = isHoliday(finalDate);

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const isToday = finalDate === todayStr;

    if (isToday && now.getHours() >= SUBMIT_DEADLINE_HOUR) {
      return res.status(400).json({
        error: `Batas pengajuan untuk hari ini sudah lewat (maks jam ${SUBMIT_DEADLINE_HOUR}:00).`
      });
    }

    const defaultHour = holiday ? START_HOUR_HOLIDAY : START_HOUR_WEEKDAY;
    const finalStartTime = start_time || `${String(defaultHour).padStart(2, '0')}:00`;

    const plannedStart = new Date(`${finalDate}T${finalStartTime}:00`);

    if (isToday && plannedStart < now) {
      return res.status(400).json({ error: 'Jam mulai sudah terlewat' });
    }

    let finalDuration = duration_hours ? parseInt(duration_hours) : null;
    if (!finalDuration) {
      const durationStr = String(record.planned_duration || '');
      const hours = durationStr.split(':')[0];
      finalDuration = hours ? parseInt(hours) : 1;
    }
    if (finalDuration < 1) finalDuration = 1;

    const result = await query(
      `UPDATE overtime_records
       SET date = $1,
           start_time = $2,
           planned_duration = $3,
           planned_start = $4,
           is_holiday = $5,
           reason = $6,
           description = $7,
           proof_text = $8,
           status = 'pending',
           revision_count = revision_count + 1,
           approval_progress = 0,
           updated_at = NOW()
       WHERE id = $9
       RETURNING *`,
      [
        finalDate,
        finalStartTime,
        `${finalDuration} hours`,
        plannedStart.toISOString(),
        holiday,
        reason || record.reason,
        description,
        proof || record.proof_text,
        id
      ]
    );

    const updated = result.rows[0];
    console.log(`✅ Record ${id} direvisi: date=${finalDate}, start=${finalStartTime}`);

    const managersResult = await query(
      "SELECT id, email FROM users WHERE role = 'manager' AND is_active = true AND email IS NOT NULL"
    );

    const JWT_SECRET = process.env.JWT_SECRET;
    const BACKEND_URL = process.env.BACKEND_URL || 'https://overtime-backend-wd4c.onrender.com';
    let emailSent = 0;

    // Email ke MANAGER (ACTION: review ulang)
    for (const mgr of managersResult.rows) {
      const approveToken = jwt.sign(
        { recordId: updated.id, action: 'approve', managerId: mgr.id },
        JWT_SECRET,
        { expiresIn: '24h' }
      );
      const rejectToken = jwt.sign(
        { recordId: updated.id, action: 'reject', managerId: mgr.id },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      const r = await sendEmail({
        to: mgr.email,
        ...templates.revisionResubmitted({
          employeeName: updated.employee_name,
          date: finalDate,
          startTime: finalStartTime,
          duration: finalDuration,
          reason: reason || record.reason,
          desc: description,
          approveUrl: `${BACKEND_URL}/api/approval/email-action?token=${approveToken}`,
          rejectUrl: `${BACKEND_URL}/api/approval/email-action?token=${rejectToken}`
        })
      });
      if (r.success) emailSent++;
    }

    // Email ke EMPLOYEE (FYI)
    const fyiSent = await notifyUser(updated.employee_id, 'pendingApproval', {
      date: finalDate,
      startTime: finalStartTime,
      duration: finalDuration,
      managerName: 'Atasan'
    });
    emailSent += fyiSent;

    res.json({ ...updated, email_sent: emailSent });
  } catch (err) {
    console.error('POST /:id/revise error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// POST /:id/revise-proof — Revisi bukti (employee)
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
    const submittedAt = new Date().toLocaleString('id-ID');

    // Email ke MANAGER (ACTION: verifikasi ulang)
    const mgrSent = await notifyAllManagers('proofRevisionResubmitted', {
      employeeName: record.employee_name,
      proof: proof_text,
      submittedAt
    });

    // Email ke EMPLOYEE (FYI)
    const empSent = await notifyUser(record.employee_id, 'proofPendingFyi', {
      duration: record.actual_duration || '-',
      submittedAt
    });

    res.json({ ...record, email_sent: mgrSent + empSent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// GET /stats/summary — Total jam bulan ini untuk user
// ============================================
router.get('/stats/summary', requireAuth, async (req, res) => {
  const user = req.user;

  try {
    // Hitung total jam dari completed + pending_verification (yang sudah ada durasi aktual)
    let sql = `
      SELECT 
        COALESCE(SUM(EXTRACT(EPOCH FROM actual_duration))/3600, 0) as total_hours,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
        COUNT(*) FILTER (WHERE status = 'pending_verification') as pending_verify_count,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
        COUNT(*) FILTER (WHERE status IN ('revision', 'rejected')) as revision_count
      FROM overtime_records
      WHERE date_trunc('month', date) = date_trunc('month', CURRENT_DATE)
        AND actual_duration IS NOT NULL
    `;
    const params = [];
    
    if (!['manager', 'admin', 'reviewer'].includes(user.role)) {
      sql += ` AND employee_id = $1`;
      params.push(user.id);
    }

    const result = await query(sql, params);
    const row = result.rows[0];

    res.json({
      total_hours: parseFloat(row.total_hours).toFixed(1),
      completed_count: parseInt(row.completed_count),
      pending_verify_count: parseInt(row.pending_verify_count),
      pending_count: parseInt(row.pending_count),
      revision_count: parseInt(row.revision_count)
    });
  } catch (err) {
    console.error('stats/summary error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
