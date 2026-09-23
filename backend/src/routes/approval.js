import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../db.js';
import { requireAuth, requireManager } from '../auth.js';
import { sendEmail, templates } from '../mailer.js';

const router = Router();

async function notifyUser(userId, templateName, data) {
  try {
    const result = await query('SELECT email FROM users WHERE id = $1', [userId]);
    const email = result.rows[0]?.email;
    if (!email) return 0;
    const r = await sendEmail({ to: email, ...templates[templateName](data) });
    return r.success ? 1 : 0;
  } catch (err) {
    console.error('notifyUser:', err.message);
    return 0;
  }
}

function renderEmailActionPage(type, message) {
  const colors = {
    success: { bg: '#10b981,#059669', emoji: '✅', title: 'Berhasil Disetujui' },
    rejected: { bg: '#ef4444,#dc2626', emoji: '❌', title: 'Pengajuan Ditolak' },
    info: { bg: '#6366f1,#8b5cf6', emoji: 'ℹ️', title: 'Info' },
    error: { bg: '#64748b,#475569', emoji: '⚠️', title: 'Terjadi Kesalahan' }
  };
  const c = colors[type] || colors.info;

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${c.title} — Sistem Lembur Cimory</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: linear-gradient(135deg, #0f0f1e, #1a1a2e, #312e81);
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }
  .card {
    background: white;
    border-radius: 24px;
    max-width: 420px;
    width: 100%;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    text-align: center;
    animation: slideUp 0.5s cubic-bezier(.2,.9,.3,1);
  }
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(30px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .header {
    background: linear-gradient(135deg, ${c.bg});
    padding: 40px 24px 32px;
    color: white;
  }
  .emoji { font-size: 64px; margin-bottom: 12px; }
  .title { font-size: 24px; font-weight: 700; letter-spacing: -0.5px; }
  .body { padding: 32px 24px; }
  .message { font-size: 15px; color: #475569; line-height: 1.6; margin-bottom: 24px; }
  .btn {
    display: inline-block;
    padding: 14px 32px;
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    color: white;
    text-decoration: none;
    border-radius: 14px;
    font-weight: 600;
    font-size: 14px;
  }
  .footer {
    background: #f8fafc;
    padding: 16px;
    font-size: 11px;
    color: #94a3b8;
    border-top: 1px solid #e2e8f0;
  }
</style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="emoji">${c.emoji}</div>
      <div class="title">${c.title}</div>
    </div>
    <div class="body">
      <p class="message">${message}</p>
      <a href="https://overtime-system.desi-arr863.workers.dev/manager.html" class="btn">Buka Sistem →</a>
    </div>
    <div class="footer">Sistem Monitoring Lembur Cimory</div>
  </div>
</body>
</html>`;
}

// ============================================
// GET /email-action?token=xxx — approve/reject via email
// ============================================
router.get('/email-action', async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).send(renderEmailActionPage('error', 'Token tidak ada'));
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(400).send(renderEmailActionPage('error', 'Token tidak valid atau sudah kedaluwarsa (maks 24 jam)'));
  }

  const { recordId, action, managerId } = payload;

  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).send(renderEmailActionPage('error', 'Aksi tidak valid'));
  }

  try {
    const recordResult = await query('SELECT * FROM overtime_records WHERE id = $1', [recordId]);
    const record = recordResult.rows[0];

    if (!record) {
      return res.send(renderEmailActionPage('error', 'Record tidak ditemukan'));
    }

    if (record.status !== 'pending') {
      return res.send(renderEmailActionPage('info', `Pengajuan ${record.employee_name} sudah diproses sebelumnya (status: ${record.status})`));
    }

    const managerResult = await query('SELECT full_name FROM users WHERE id = $1', [managerId]);
    const managerName = managerResult.rows[0]?.full_name || 'Atasan';

    if (action === 'approve') {
      await query(
        `UPDATE overtime_records
         SET status = 'approved', approved_by = $1, approved_at = NOW(),
             approval_note = $2, updated_at = NOW()
         WHERE id = $3`,
        [managerId, `Disetujui via email oleh ${managerName}`, recordId]
      );

      const empResult = await query('SELECT email FROM users WHERE id = $1', [record.employee_id]);
      if (empResult.rows[0]?.email) {
        await sendEmail({
          to: empResult.rows[0].email,
          ...templates.approved({
            date: record.date,
            startTime: record.start_time
          })
        });
      }

      console.log(`✅ Record ${recordId} DISETUJUI via email oleh ${managerName}`);
      return res.send(renderEmailActionPage('success', `Pengajuan <strong>${record.employee_name}</strong> (${record.date} · ${record.start_time}) berhasil <strong>DISETUJUI</strong>.<br><br>Karyawan akan menerima notifikasi.`));
    } else {
      await query(
        `UPDATE overtime_records
         SET status = 'rejected', approval_note = $1, updated_at = NOW()
         WHERE id = $2`,
        [`Ditolak via email oleh ${managerName}`, recordId]
      );

      const empResult = await query('SELECT email FROM users WHERE id = $1', [record.employee_id]);
      if (empResult.rows[0]?.email) {
        await sendEmail({
          to: empResult.rows[0].email,
          ...templates.rejected({
            date: record.date,
            startTime: record.start_time,
            note: `Ditolak via email oleh ${managerName}`
          })
        });
      }

      console.log(`❌ Record ${recordId} DITOLAK via email oleh ${managerName}`);
      return res.send(renderEmailActionPage('rejected', `Pengajuan <strong>${record.employee_name}</strong> (${record.date} · ${record.start_time}) telah <strong>DITOLAK</strong>.<br><br>Karyawan akan menerima notifikasi.`));
    }
  } catch (err) {
    console.error('email-action error:', err.message);
    return res.status(500).send(renderEmailActionPage('error', 'Gagal memproses: ' + err.message));
  }
});

// ============================================
// POST /:id/approve-schedule — Approve via sistem
// ============================================
router.post('/:id/approve-schedule', requireAuth, requireManager, async (req, res) => {
  const { id } = req.params;
  const { note } = req.body;

  try {
    const result = await query(
      `UPDATE overtime_records
       SET status = 'approved', approved_by = $1, approved_at = NOW(),
           approval_note = $2, updated_at = NOW()
       WHERE id = $3 AND status = 'pending'
       RETURNING *`,
      [req.user.id, note || null, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Record tidak ditemukan / bukan pending' });

    const record = result.rows[0];
    const emailSent = await notifyUser(record.employee_id, 'approved', {
      date: record.date,
      startTime: record.start_time
    });

    res.json({ ...record, email_sent: emailSent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// POST /:id/reject — Reject via sistem
// ============================================
router.post('/:id/reject', requireAuth, requireManager, async (req, res) => {
  const { id } = req.params;
  const { note } = req.body;

  try {
    const result = await query(
      `UPDATE overtime_records
       SET status = 'rejected', approval_note = $1, updated_at = NOW()
       WHERE id = $2 AND status = 'pending'
       RETURNING *`,
      [note || 'Ditolak', id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Tidak ditemukan' });

    const record = result.rows[0];
    const emailSent = await notifyUser(record.employee_id, 'rejected', {
      date: record.date,
      startTime: record.start_time,
      note: note || 'Ditolak'
    });

    res.json({ ...record, email_sent: emailSent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// POST /:id/request-revision — Minta revisi
// ============================================
router.post('/:id/request-revision', requireAuth, requireManager, async (req, res) => {
  const { id } = req.params;
  const { note } = req.body;
  if (!note) return res.status(400).json({ error: 'Catatan wajib' });

  try {
    const result = await query(
      `UPDATE overtime_records
       SET status = 'revision', approval_note = $1,
           revision_count = revision_count + 1, updated_at = NOW()
       WHERE id = $2 AND status = 'pending'
       RETURNING *`,
      [note, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Tidak ditemukan' });

    const record = result.rows[0];
    const emailSent = await notifyUser(record.employee_id, 'revision', { note });

    res.json({ ...record, email_sent: emailSent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// POST /:id/reopen — Buka kembali rejected/revision
// ============================================
router.post('/:id/reopen', requireAuth, requireManager, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await query(
      `UPDATE overtime_records
       SET status = 'pending', approval_progress = 0,
           approval_note = COALESCE(approval_note, '') || E'\n[Dibuka kembali ' || NOW() || ']',
           updated_at = NOW()
       WHERE id = $1 AND status IN ('rejected', 'revision')
       RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Tidak ditemukan' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// POST /:id/verify-result — Verifikasi hasil kerja
// ============================================
router.post('/:id/verify-result', requireAuth, requireManager, async (req, res) => {
  const { id } = req.params;
  const { action, rating, note } = req.body;

  if (!action) return res.status(400).json({ error: 'Action wajib' });

  let status, updateSql, params;

  if (action === 'approve') {
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating 1-5 wajib' });
    status = 'completed';
    updateSql = `UPDATE overtime_records
                 SET status = $1, verified_by = $2, verified_at = NOW(),
                     verify_rating = $3, verify_note = $4, verified_by_level = $5, updated_at = NOW()
                 WHERE id = $6 AND status = 'pending_verification' RETURNING *`;
    params = [status, req.user.id, rating, note || null, req.user.level, id];
  } else if (action === 'revision') {
    if (!note) return res.status(400).json({ error: 'Catatan wajib' });
    status = 'proof_revision';
    updateSql = `UPDATE overtime_records
                 SET status = $1, verify_note = $2,
                     proof_revision_count = proof_revision_count + 1, updated_at = NOW()
                 WHERE id = $3 AND status = 'pending_verification' RETURNING *`;
    params = [status, note, id];
  } else if (action === 'reject') {
    if (!note) return res.status(400).json({ error: 'Alasan wajib' });
    status = 'verify_rejected';
    updateSql = `UPDATE overtime_records
                 SET status = $1, verify_note = $2, verified_by = $3, verified_at = NOW(), updated_at = NOW()
                 WHERE id = $4 AND status = 'pending_verification' RETURNING *`;
    params = [status, note, req.user.id, id];
  } else {
    return res.status(400).json({ error: 'Action tidak valid' });
  }

  try {
    const result = await query(updateSql, params);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Tidak ditemukan' });

    const record = result.rows[0];
    let emailSent = 0;

    if (action === 'approve') {
      emailSent = await notifyUser(record.employee_id, 'verifyApproved', { rating });
    } else if (action === 'revision') {
      emailSent = await notifyUser(record.employee_id, 'proofRevision', { note });
    } else if (action === 'reject') {
      emailSent = await notifyUser(record.employee_id, 'verifyRejected', { note });
    }

    res.json({ ...record, email_sent: emailSent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
