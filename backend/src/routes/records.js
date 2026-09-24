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

function levelNum(level) {
  if (!level) return 0;
  const m = String(level).match(/^(\d+)/);
  return m ? parseInt(m[1]) : 0;
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
    if (!email) return 0;
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
    return sent;
  } catch (err) {
    console.error('notifyAllManagers error:', err.message);
    return 0;
  }
}

async function buildApprovalChain(employeeId) {
  const chain = [];
  let currentId = employeeId;
  const visited = new Set();

  for (let i = 0; i < 10; i++) {
    if (visited.has(currentId)) break;
    visited.add(currentId);

    const result = await query(
      'SELECT id, approver_ids, level, full_name FROM users WHERE id = $1',
      [currentId]
    );
    const user = result.rows[0];
    if (!user) break;

    const approverIds = user.approver_ids || [];
    if (approverIds.length === 0) break;

    const approverId = parseInt(approverIds[0]);
    if (!approverId) break;

    const approverResult = await query(
      'SELECT id, level, full_name, is_active FROM users WHERE id = $1',
      [approverId]
    );
    const approver = approverResult.rows[0];
    if (!approver || !approver.is_active) break;

    chain.push(approverId);
    currentId = approverId;
  }

  return chain;
}

async function validateChainHasFinal(chain) {
  if (chain.length === 0) return false;
  for (const approverId of chain) {
    const result = await query('SELECT level FROM users WHERE id = $1', [approverId]);
    if (result.rows[0] && levelNum(result.rows[0].level) >= 4) {
      return true;
    }
  }
  return false;
}

router.get('/employees/list', requireAuth, requireManager, async (req, res) => {
  const user = req.user;
  
  try {
    if (user.role === 'admin') {
      const result = await query(
        `SELECT id, full_name, email, jabatan, level FROM users
         WHERE role = 'employee' AND is_active = true
         ORDER BY level DESC, full_name`
      );
      return res.json(result.rows);
    }
    
    const result = await query(
      `WITH RECURSIVE subordinates AS (
        SELECT id, full_name, email, jabatan, level, approver_ids, 1 as depth
        FROM users
        WHERE $1 = ANY(approver_ids) AND is_active = true AND role = 'employee'
        UNION ALL
        SELECT u.id, u.full_name, u.email, u.jabatan, u.level, u.approver_ids, s.depth + 1
        FROM users u
        INNER JOIN subordinates s ON s.id = ANY(u.approver_ids)
        WHERE u.is_active = true AND u.role = 'employee' AND s.depth < 10
      )
      SELECT DISTINCT id, full_name, email, jabatan, level
      FROM subordinates
      ORDER BY level DESC, full_name`,
      [user.id]
    );

    console.log(`👥 ${user.name} (${user.role}, level ${user.level}) → ${result.rows.length} bawahan`);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /employees/list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

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
    return res.status(400).json({ error: 'Semua field wajib diisi' });
  }

  const durationNum = parseInt(duration_hours);
  if (!durationNum || durationNum < 1) {
    return res.status(400).json({ error: 'Durasi minimal 1 jam' });
  }

  if (!isManager && userLevel !== 2) {
    return res.status(403).json({ 
      error: `Hanya level 2 (Staff) yang bisa mengajukan lembur sendiri. Level kamu: ${user.level || '-'}` 
    });
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
  let directApproverId = null;

  if (!isManager) {
    approvalChainIds = await buildApprovalChain(user.id);
    
    if (approvalChainIds.length === 0) {
      return res.status(400).json({ 
        error: 'Belum ada approver untuk kamu. Hubungi admin untuk set atasan langsung.' 
      });
    }

    const hasFinal = await validateChainHasFinal(approvalChainIds);
    if (!hasFinal) {
      return res.status(400).json({ 
        error: 'Chain approver tidak punya level 4+ (Manager). Hubungi admin untuk lengkapi struktur atasan.' 
      });
    }

    directApproverId = approvalChainIds[0];
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

    let emailSent = 0;

    if (!isManager) {
      const JWT_SECRET = process.env.JWT_SECRET;
      const BACKEND_URL = process.env.BACKEND_URL || 'https://overtime-backend-wd4c.onrender.com';

      const allApproversResult = await query(
        'SELECT id, email, full_name, level FROM users WHERE id = ANY($1)',
        [approvalChainIds]
      );
      
      const allApprovers = approvalChainIds.map(id => 
        allApproversResult.rows.find(r => r.id === id)
      ).filter(Boolean);

      const directApprover = allApprovers[0];
      const finalApprover = allApprovers.find(a => levelNum(a.level) >= 4);

      if (directApprover?.email) {
        const approveToken = jwt.sign(
          { recordId: record.id, action: 'approve-direct', approverId: directApprover.id },
          JWT_SECRET,
          { expiresIn: '24h' }
        );
        const rejectToken = jwt.sign(
          { recordId: record.id, action: 'reject', approverId: directApprover.id },
          JWT_SECRET,
          { expiresIn: '24h' }
        );

        const r = await sendEmail({
          to: directApprover.email,
          ...templates.newRequestDirect({
            employeeName: targetName,
            employeeLevel: user.level,
            date, startTime: finalStartTime,
            duration: durationNum,
            reason, desc: description,
            approveUrl: `${BACKEND_URL}/api/approval/email-action?token=${approveToken}`,
            rejectUrl: `${BACKEND_URL}/api/approval/email-action?token=${rejectToken}`
          })
        });
        if (r.success) emailSent++;
      }

      if (finalApprover?.email) {
        const approveToken = jwt.sign(
          { recordId: record.id, action: 'approve-final', approverId: finalApprover.id },
          JWT_SECRET,
          { expiresIn: '24h' }
        );
        const rejectToken = jwt.sign(
          { recordId: record.id, action: 'reject', approverId: finalApprover.id },
          JWT_SECRET,
          { expiresIn: '24h' }
        );

        const r = await sendEmail({
          to: finalApprover.email,
          ...templates.newRequestFinal({
            employeeName: targetName,
            employeeLevel: user.level,
            directApproverName: directApprover?.full_name || '-',
            directApproved: false,
            date, startTime: finalStartTime,
            duration: durationNum,
            reason,
            approveUrl: `${BACKEND_URL}/api/approval/email-action?token=${approveToken}`,
            rejectUrl: `${BACKEND_URL}/api/approval/email-action?token=${rejectToken}`
          })
        });
        if (r.success) emailSent++;
      }

      const fyiSent = await notifyUser(record.employee_id, 'pendingApproval', {
        date, startTime: finalStartTime,
        duration: durationNum
      });
      emailSent += fyiSent;

    } else {
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

router.get('/', requireAuth, async (req, res) => {
  const user = req.user;
  const { status, limit = 100 } = req.query;

  let sql = '';
  const params = [];
  let idx = 1;

  if (user.role === 'admin' || user.role === 'reviewer') {
    sql = `
      SELECT *,
        ROUND(COALESCE(EXTRACT(EPOCH FROM planned_duration), 0) / 3600.0, 2) as planned_hours,
        ROUND(COALESCE(EXTRACT(EPOCH FROM actual_duration), 0) / 3600.0, 2) as actual_hours
      FROM overtime_records
    `;
  } else if (user.role === 'manager' || levelNum(user.level) >= 3) {
    sql = `
      WITH RECURSIVE subordinates AS (
        SELECT id FROM users WHERE $1 = ANY(approver_ids) AND is_active = true
        UNION ALL
        SELECT u.id FROM users u
        INNER JOIN subordinates s ON s.id = ANY(u.approver_ids)
        WHERE u.is_active = true
      )
      SELECT *,
        ROUND(COALESCE(EXTRACT(EPOCH FROM planned_duration), 0) / 3600.0, 2) as planned_hours,
        ROUND(COALESCE(EXTRACT(EPOCH FROM actual_duration), 0) / 3600.0, 2) as actual_hours
      FROM overtime_records
      WHERE (employee_id = $1 OR employee_id IN (SELECT id FROM subordinates))
    `;
    params.push(user.id);
    idx = 2;
  } else {
    sql = `
      SELECT *,
        ROUND(COALESCE(EXTRACT(EPOCH FROM planned_duration), 0) / 3600.0, 2) as planned_hours,
        ROUND(COALESCE(EXTRACT(EPOCH FROM actual_duration), 0) / 3600.0, 2) as actual_hours
      FROM overtime_records
      WHERE employee_id = $1
    `;
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

    await notifyUser(record.employee_id, 'startedEmployee', {
      date: record.date,
      startTime: record.start_time,
      duration: Math.round(parseFloat(record.planned_duration?.split(':')[0] || 2))
    });

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/auto-stop', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { lat, lng, reason } = req.body;
  const user = req.user;

  if (!lat || !lng) return res.status(400).json({ error: 'Koordinat GPS wajib' });

  const distance = Math.round(haversine(lat, lng, OFFICE.lat, OFFICE.lng));

  try {
    const checkResult = await query(
      'SELECT id, employee_name, employee_id, status FROM overtime_records WHERE id = $1',
      [id]
    );
    const existing = checkResult.rows[0];

    if (!existing) return res.status(404).json({ error: 'Record tidak ditemukan' });
    if (existing.status !== 'active') {
      return res.status(400).json({ error: `Record sudah tidak aktif (status: ${existing.status})`, already_stopped: true });
    }

    const result = await query(
      `UPDATE overtime_records
       SET status = 'cancelled',
           cancel_reason = $1,
           cancelled_at = NOW(),
           actual_end = NOW(),
           actual_duration = GREATEST(NOW() - actual_start, INTERVAL '1 second'),
           gps_lat = $2, gps_lng = $3, gps_distance = $4,
           updated_at = NOW()
       WHERE id = $5 AND employee_id = $6 AND status = 'active'
       RETURNING *`,
      [reason || `Keluar radius kantor (${distance}m)`, lat, lng, distance, id, user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Record tidak bisa di-auto-stop' });
    }

    const record = result.rows[0];
    const stoppedAt = new Date().toLocaleString('id-ID');
    const reasonText = reason || `Keluar radius kantor (${distance}m)`;

    await notifyUser(record.employee_id, 'autoStopEmployee', {
      reason: reasonText, distance, stoppedAt
    });
    await notifyAllManagers('autoStopManager', {
      employeeName: record.employee_name, distance, stoppedAt, reason: reasonText
    });

    res.json(record);
  } catch (err) {
    console.error('auto-stop error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

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
    if (!rec || !rec.actual_start) return res.status(404).json({ error: 'Record tidak ditemukan / belum dimulai' });
    if (rec.status !== 'active') return res.status(400).json({ error: `Record tidak aktif (status: ${rec.status})` });

    const durationMs = Date.now() - new Date(rec.actual_start).getTime();
    const durationHours = durationMs / 3600000;

    if (durationHours < MIN_OVERTIME_HOURS) {
      const result = await query(
        `UPDATE overtime_records
         SET status = 'cancelled',
             cancel_reason = $1,
             cancelled_at = NOW(), actual_end = NOW(),
             actual_duration = GREATEST(NOW() - actual_start, INTERVAL '1 second'),
             proof_text = $2, proof_file_name = $3, proof_uploaded_at = NOW(),
             updated_at = NOW()
         WHERE id = $4 AND (employee_id = $5 OR $6 IN ('manager', 'admin'))
           AND status = 'active'
         RETURNING *`,
        [
          `Durasi kurang dari ${MIN_OVERTIME_HOURS} jam (${durationHours.toFixed(2)} jam) — tidak dihitung lembur`,
          proof_text, proof_file_name || null, id, user.id, user.role
        ]
      );

      if (result.rows.length === 0) return res.status(404).json({ error: 'Record tidak ditemukan' });

      const record = result.rows[0];
      const reasonText = `Durasi ${durationHours.toFixed(2)} jam < 1 jam — tidak dihitung lembur`;

      await notifyUser(record.employee_id, 'notCountedEmployee', {
        employeeName: record.employee_name, date: record.date,
        duration: `${durationHours.toFixed(2)} jam`, reason: reasonText
      });
      await notifyAllManagers('notCountedManager', {
        employeeName: record.employee_name, date: record.date,
        duration: `${durationHours.toFixed(2)} jam`, reason: reasonText
      });

      return res.json({ ...record, not_counted: true, message: reasonText });
    }

    const result = await query(
      `UPDATE overtime_records
       SET status = 'pending_verification',
           actual_end = NOW(),
           actual_duration = GREATEST(NOW() - actual_start, INTERVAL '1 second'),
           proof_text = $1, proof_file_name = $2, proof_uploaded_at = NOW(),
           updated_at = NOW()
       WHERE id = $3 AND (employee_id = $4 OR $5 IN ('manager', 'admin'))
         AND status = 'active'
       RETURNING *`,
      [proof_text, proof_file_name || null, id, user.id, user.role]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Record tidak ditemukan' });

    const record = result.rows[0];
    const durationStr = `${durationHours.toFixed(2)} jam`;
    const submittedAt = new Date().toLocaleString('id-ID');

    const mgrSent = await notifyAllManagers('proofSubmitted', {
      employeeName: record.employee_name, duration: durationStr, proof: proof_text
    });
    const empSent = await notifyUser(record.employee_id, 'proofPendingFyi', {
      duration: durationStr, submittedAt
    });

    res.json({ ...record, email_sent: mgrSent + empSent, not_counted: false });
  } catch (err) {
    console.error('finish error:', err.message);
    res.status(500).json({ error: err.message });
  }
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
           actual_end = NOW(),
           actual_duration = GREATEST(NOW() - actual_start, INTERVAL '1 second'),
           updated_at = NOW()
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
      return res.status(400).json({ error: `Batas pengajuan sudah lewat (maks ${SUBMIT_DEADLINE_HOUR}:00)` });
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
       SET date = $1, start_time = $2, planned_duration = $3, planned_start = $4,
           is_holiday = $5, reason = $6, description = $7, proof_text = $8,
           status = 'pending', approval_progress = 0,
           direct_approver_id = NULL, direct_approval_at = NULL, direct_approval_note = NULL,
           final_approver_id = NULL, final_approval_at = NULL, jumped_in = FALSE,
           revision_count = revision_count + 1, updated_at = NOW()
       WHERE id = $9
       RETURNING *`,
      [
        finalDate, finalStartTime, `${finalDuration} hours`, plannedStart.toISOString(),
        holiday, reason || record.reason, description, proof || record.proof_text, id
      ]
    );

    const updated = result.rows[0];

    const chain = updated.approval_chain || [];
    const allApproversResult = await query(
      'SELECT id, email, full_name, level FROM users WHERE id = ANY($1)',
      [chain]
    );
    const allApprovers = chain.map(id => allApproversResult.rows.find(r => r.id === id)).filter(Boolean);
    const directApprover = allApprovers[0];
    const finalApprover = allApprovers.find(a => levelNum(a.level) >= 4);

    const JWT_SECRET = process.env.JWT_SECRET;
    const BACKEND_URL = process.env.BACKEND_URL || 'https://overtime-backend-wd4c.onrender.com';
    let emailSent = 0;

    if (directApprover?.email) {
      const approveToken = jwt.sign(
        { recordId: updated.id, action: 'approve-direct', approverId: directApprover.id },
        JWT_SECRET, { expiresIn: '24h' }
      );
      const rejectToken = jwt.sign(
        { recordId: updated.id, action: 'reject', approverId: directApprover.id },
        JWT_SECRET, { expiresIn: '24h' }
      );
      const r = await sendEmail({
        to: directApprover.email,
        ...templates.revisionResubmitted({
          employeeName: updated.employee_name,
          date: finalDate, startTime: finalStartTime,
          duration: finalDuration,
          reason: reason || record.reason,
          desc: description,
          approveUrl: `${BACKEND_URL}/api/approval/email-action?token=${approveToken}`,
          rejectUrl: `${BACKEND_URL}/api/approval/email-action?token=${rejectToken}`
        })
      });
      if (r.success) emailSent++;
    }

    if (finalApprover?.email) {
      const r = await sendEmail({
        to: finalApprover.email,
        ...templates.revisionResubmittedFinal({
          employeeName: updated.employee_name,
          directApproverName: directApprover?.full_name || '-',
          date: finalDate, startTime: finalStartTime,
          duration: finalDuration
        })
      });
      if (r.success) emailSent++;
    }

    const fyiSent = await notifyUser(updated.employee_id, 'pendingApproval', {
      date: finalDate, startTime: finalStartTime, duration: finalDuration
    });
    emailSent += fyiSent;

    res.json({ ...updated, email_sent: emailSent });
  } catch (err) {
    console.error('POST /:id/revise error:', err.message);
    res.status(500).json({ error: err.message });
  }
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

    const record = result.rows[0];
    const submittedAt = new Date().toLocaleString('id-ID');

    const mgrSent = await notifyAllManagers('proofRevisionResubmitted', {
      employeeName: record.employee_name, proof: proof_text, submittedAt
    });
    const empSent = await notifyUser(record.employee_id, 'proofPendingFyi', {
      duration: record.actual_duration || '-', submittedAt
    });

    res.json({ ...record, email_sent: mgrSent + empSent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats/summary', requireAuth, async (req, res) => {
  const user = req.user;
  try {
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
