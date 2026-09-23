import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';
import { sendEmail, templates } from '../mailer.js';

const router = Router();

const OFFICE = {
  lat: -6.192028366395371,
  lng: 106.73758715254144,
  radius: 100
};

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Buat pengajuan / tugaskan lembur
router.post('/', requireAuth, async (req, res) => {
  const {
    date, start_time, duration_hours,
    reason, description,
    employee_id, employee_name
  } = req.body;

  const user = req.user;
  const isManager = user.role === 'manager';

  if (!date || !start_time || !duration_hours || !reason || !description) {
    return res.status(400).json({ error: 'Semua field wajib' });
  }

  const plannedStart = new Date(`${date}T${start_time}:00`);
  if (plannedStart < new Date()) {
    return res.status(400).json({ error: 'Jam mulai sudah terlewat' });
  }

  const targetId = isManager && employee_id ? employee_id : user.id;
  const targetName = isManager && employee_name ? employee_name : user.name;

  try {
    const result = await query(
      `INSERT INTO overtime_records 
       (employee_id, employee_name, date, start_time, planned_duration,
        planned_start, reason, description, source, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        targetId, targetName,
        date, start_time,
        `${duration_hours} hours`,
        plannedStart.toISOString(),
        reason, description,
        isManager ? 'manager' : 'employee',
        isManager ? 'approved' : 'pending'
      ]
    );

    const record = result.rows[0];

    // Notifikasi email
    if (!isManager) {
      // Kirim ke semua manager
      const managers = await query("SELECT email FROM users WHERE role = 'manager'");
      for (const m of managers.rows) {
        await sendEmail({
          to: m.email,
          ...templates.newRequest({
            employeeName: user.name,
            date, startTime: start_time,
            duration: duration_hours,
            reason, desc: description
          })
        });
      }
    } else {
      // Manager menugaskan → notif ke karyawan
      const emp = await query('SELECT email FROM users WHERE id = $1', [targetId]);
      if (emp.rows[0]) {
        await sendEmail({
          to: emp.rows[0].email,
          ...templates.approved({
            date, startTime: start_time
          })
        });
      }
    }

    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ambil daftar record
router.get('/', requireAuth, async (req, res) => {
  const user = req.user;
  const { status, limit = 100 } = req.query;

  let sql = 'SELECT * FROM overtime_records';
  const params = [];

  if (user.role !== 'manager') {
    sql += ' WHERE employee_id = $1';
    params.push(user.id);
  }

  if (status) {
    sql += params.length ? ' AND' : ' WHERE';
    sql += ` status = $${params.length + 1}`;
    params.push(status);
  }

  sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
  params.push(parseInt(limit));

  try {
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mulai lembur dengan verifikasi GPS
router.post('/:id/start', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { lat, lng, accuracy } = req.body;
  const user = req.user;

  if (!lat || !lng) {
    return res.status(400).json({ error: 'Koordinat GPS wajib' });
  }

  const distance = Math.round(haversine(lat, lng, OFFICE.lat, OFFICE.lng));

  if (distance > OFFICE.radius) {
    return res.status(400).json({
      error: `Di luar radius kantor (${distance}m > ${OFFICE.radius}m)`
    });
  }

  try {
    const result = await query(
      `UPDATE overtime_records
       SET status = 'active',
           actual_start = NOW(),
           gps_lat = $1, gps_lng = $2, gps_accuracy = $3, gps_distance = $4,
           auto_started = FALSE,
           updated_at = NOW()
       WHERE id = $5 
         AND (employee_id = $6 OR $7 = 'manager')
         AND status = 'approved'
       RETURNING *`,
      [lat, lng, accuracy, distance, id, user.id, user.role]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Record tidak ditemukan / tidak bisa dimulai' });
    }

    const record = result.rows[0];

    await query(
      `INSERT INTO activity_logs (record_id, actor_id, actor_name, action, details)
       VALUES ($1, $2, $3, 'started', $4)`,
      [record.id, user.id, user.name, JSON.stringify({ distance, accuracy })]
    );

    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Selesai lembur + upload bukti
router.post('/:id/finish', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { proof_text, proof_file_name } = req.body;
  const user = req.user;

  if (!proof_text) {
    return res.status(400).json({ error: 'Deskripsi bukti wajib diisi' });
  }

  try {
    const result = await query(
      `UPDATE overtime_records
       SET status = 'pending_verification',
           actual_end = NOW(),
           actual_duration = NOW() - actual_start,
           proof_text = $1,
           proof_file_name = $2,
           proof_uploaded_at = NOW(),
           updated_at = NOW()
       WHERE id = $3
         AND (employee_id = $4 OR $5 = 'manager')
         AND status = 'active'
       RETURNING *`,
      [proof_text, proof_file_name || null, id, user.id, user.role]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Record tidak ditemukan / tidak aktif' });
    }

    const record = result.rows[0];

    // Notifikasi ke manager
    const managers = await query("SELECT email FROM users WHERE role = 'manager'");
    for (const m of managers.rows) {
      await sendEmail({
        to: m.email,
        ...templates.proofSubmitted({
          employeeName: record.employee_name,
          duration: record.actual_duration
        })
      });
    }

    await query(
      `INSERT INTO activity_logs (record_id, actor_id, actor_name, action, details)
       VALUES ($1, $2, $3, 'finished', $4)`,
      [record.id, user.id, user.name, JSON.stringify({ proof: proof_text })]
    );

    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Batalkan lembur
router.post('/:id/cancel', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const user = req.user;

  if (!reason) {
    return res.status(400).json({ error: 'Alasan pembatalan wajib' });
  }

  try {
    const result = await query(
      `UPDATE overtime_records
       SET status = 'cancelled',
           cancel_reason = $1,
           cancelled_at = NOW(),
           actual_duration = NOW() - actual_start,
           updated_at = NOW()
       WHERE id = $2
         AND (employee_id = $3 OR $4 = 'manager')
         AND status = 'active'
       RETURNING *`,
      [reason, id, user.id, user.role]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Record tidak ditemukan' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Revisi pengajuan (setelah rejected/revision)
router.post('/:id/revise', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { reason, description, proof } = req.body;
  const user = req.user;

  if (!description) {
    return res.status(400).json({ error: 'Deskripsi wajib' });
  }

  try {
    const result = await query(
      `UPDATE overtime_records
       SET reason = $1,
           description = $2,
           proof_text = $3,
           status = 'pending',
           revision_count = revision_count + 1,
           updated_at = NOW()
       WHERE id = $4
         AND (employee_id = $5 OR $6 = 'manager')
         AND status IN ('revision', 'rejected')
       RETURNING *`,
      [reason, description, proof || null, id, user.id, user.role]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Record tidak ditemukan / tidak bisa direvisi' });
    }

    const record = result.rows[0];

    // Notif ke manager
    const managers = await query("SELECT email FROM users WHERE role = 'manager'");
    for (const m of managers.rows) {
      await sendEmail({
        to: m.email,
        ...templates.newRequest({
          employeeName: user.name,
          date: record.date,
          startTime: record.start_time,
          duration: record.planned_duration,
          reason, desc: description
        })
      });
    }

    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Revisi bukti (setelah proof_revision)
router.post('/:id/revise-proof', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { proof_text, proof_file_name } = req.body;
  const user = req.user;

  if (!proof_text) {
    return res.status(400).json({ error: 'Deskripsi bukti wajib' });
  }

  try {
    const result = await query(
      `UPDATE overtime_records
       SET proof_text = $1,
           proof_file_name = $2,
           proof_uploaded_at = NOW(),
           status = 'pending_verification',
           proof_revision_count = proof_revision_count + 1,
           updated_at = NOW()
       WHERE id = $3
         AND (employee_id = $4 OR $5 = 'manager')
         AND status = 'proof_revision'
       RETURNING *`,
      [proof_text, proof_file_name || null, id, user.id, user.role]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Record tidak ditemukan' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;