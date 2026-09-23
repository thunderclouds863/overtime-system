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

function levelNum(level) {
  if (!level) return 0;
  const match = String(level).match(/^(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

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

// Cari atasan sampai level >= 4a (untuk approval chain)
async function buildApprovalChain(employeeId) {
  const chain = [];
  let currentId = employeeId;
  const visited = new Set();

  for (let i = 0; i < 10; i++) {
    if (visited.has(currentId)) break;
    visited.add(currentId);

    const result = await query(
      'SELECT id, level, approver_ids, role FROM users WHERE id = $1',
      [currentId]
    );
    const user = result.rows[0];
    if (!user) break;
    if (levelNum(user.level) >= 4) break;

    const approverIds = user.approver_ids || [];
    if (approverIds.length === 0) break;

    const approverResult = await query(
      'SELECT id, level, role, email, full_name FROM users WHERE id = ANY($1) AND is_active = true ORDER BY level DESC LIMIT 1',
      [approverIds]
    );
    const approver = approverResult.rows[0];
    if (!approver) break;

    chain.push({ id: approver.id, email: approver.email, name: approver.full_name });
    currentId = approver.id;

    if (levelNum(approver.level) >= 4) break;
  }
  return chain;
}

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

// Buat pengajuan / tugaskan lembur
router.post('/', requireAuth, async (req, res) => {
  const {
    date, start_time, duration_hours,
    reason, description,
    employee_id, employee_name
  } = req.body;

  const user = req.user;
  const userLevel = levelNum(user.level);
  const isManager = user.role === 'manager' || user.role === 'admin';

  if (!date || !duration_hours || !reason || !description) {
    return res.status(400).json({ error: 'Semua field wajib' });
  }

  if (!isManager && userLevel >= 3) {
    return res.status(403).json({ error: 'Level kamu tidak bisa mengajukan lembur sendiri' });
  }

  const holiday = isHoliday(date);
  const finalStartTime = start_time || (holiday ? '08:00' : '18:00');

  const plannedStart = new Date(`${date}T${finalStartTime}:00`);
  if (plannedStart < new Date()) {
    return res.status(400).json({ error: 'Jam mulai sudah terlewat' });
  }

  const targetId = isManager && employee_id ? employee_id : user.id;
  const targetName = isManager && employee_name ? employee_name : user.name;

  // Bangun approval chain
  let approvalChainIds = [];
  let initialStatus = 'pending';
  let notifyEmails = [];

  if (isManager && employee_id) {
    // Manager assign
    if (userLevel >= 4) {
      initialStatus = 'approved';
    } else {
      const chain = await buildApprovalChain(user.id);
      approvalChainIds = chain.map(c => c.id);
      notifyEmails = chain.slice(0, 1).map(c => c.email);
    }
  } else {
    // Employee ajukan
    const chain = await buildApprovalChain(user.id);
    approvalChainIds = chain.map(c => c.id);
    if (approvalChainIds.length === 0 && userLevel >= 4) {
      initialStatus = 'approved';
    } else {
      notifyEmails = chain.slice(0, 1).map(c => c.email);
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

    // KIRIM EMAIL
    let emailResult = { success: true, sent: 0 };
    if (initialStatus === 'pending' && notifyEmails.length > 0) {
      for (const email of notifyEmails) {
        const r = await sendEmail({
          to: email,
          ...templates.newRequest({
            employeeName: targetName,
            date, startTime: finalStartTime,
            duration: duration_hours,
            reason, desc: description
          })
        });
        if (r.success) emailResult.sent++;
      }
    } else if (initialStatus === 'approved') {
      const emp = await query('SELECT email FROM users WHERE id = $1', [targetId]);
      if (emp.rows[0]?.email) {
        const r = await sendEmail({
          to: emp.rows[0].email,
          ...templates.approved({ date, startTime: finalStartTime })
        });
        if (r.success) emailResult.sent++;
      }
    }

    res.json({
      ...record,
      email_sent: emailResult.sent,
      email_recipients: notifyEmails
    });
  } catch (err) {
    console.error('POST /records error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/', requireAuth, async (req, res) => {
  const user = req.user;
  const { status, limit = 100 } = req.query;

  let sql = 'SELECT * FROM overtime_records';
  const params = [];
  let idx = 1;

  if (user.role === 'admin') {
    // all
  } else if (user.role === 'manager') {
    sql += ` WHERE (employee_id = $1 OR $1 = ANY(approval_chain))`;
    params.push(user.id);
    idx = 2;
  } else {
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
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mulai lembur
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Selesai lembur
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
    if (result.rows.length === 0) return res.status(404).json({ error: 'Record tidak ditemukan' });

    const record = result.rows[0];

    // Kirim email ke semua manager aktif
    const managers = await query("SELECT email FROM users WHERE role = 'manager' AND is_active = true");
    let sent = 0;
    for (const m of managers.rows) {
      const r = await sendEmail({
        to: m.email,
        ...templates.proofSubmitted({
          employeeName: record.employee_name,
          duration: record.actual_duration
        })
      });
      if (r.success) sent++;
    }

    res.json({ ...record, email_sent: sent });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

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
    const managers = await query("SELECT email FROM users WHERE role = 'manager' AND is_active = true");
    for (const m of managers.rows) {
      await sendEmail({
        to: m.email,
        ...templates.newRequest({
          employeeName: user.name,
          date: record.date, startTime: record.start_time,
          duration: record.planned_duration,
          reason, desc: description
        })
      });
    }
    res.json(record);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

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
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
