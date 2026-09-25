import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../db.js';
import { requireAuth, requireManager } from '../auth.js';
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
    console.error('notifyUser:', err.message);
    return 0;
  }
}

function renderEmailActionPage(type, message) {
  const colors = {
    success: { bg: '#059669', emoji: '✅', title: 'Berhasil Disetujui' },
    rejected: { bg: '#dc2626', emoji: '❌', title: 'Ditolak' },
    forwarded: { bg: '#0ea5e9', emoji: '🔄', title: 'Diteruskan' },
    info: { bg: '#4f46e5', emoji: 'ℹ️', title: 'Info' },
    error: { bg: '#64748b', emoji: '⚠️', title: 'Error' }
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
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #0f0f1e, #1a1a2e, #312e81); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
  .card { background: white; border-radius: 24px; max-width: 420px; width: 100%; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.3); text-align: center; animation: slideUp 0.5s cubic-bezier(.2,.9,.3,1); }
  @keyframes slideUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
  .header { background: ${c.bg}; padding: 40px 24px 32px; color: white; }
  .emoji { font-size: 64px; margin-bottom: 12px; }
  .title { font-size: 24px; font-weight: 700; }
  .body { padding: 32px 24px; }
  .message { font-size: 15px; color: #475569; line-height: 1.6; margin-bottom: 24px; }
  .btn { display: inline-block; padding: 14px 32px; background: #4f46e5; color: white; text-decoration: none; border-radius: 14px; font-weight: 600; font-size: 14px; }
  .footer { background: #f8fafc; padding: 16px; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
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

router.get('/email-action', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send(renderEmailActionPage('error', 'Token tidak ada'));

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(400).send(renderEmailActionPage('error', 'Token tidak valid atau sudah kedaluwarsa (maks 24 jam)'));
  }

  const { recordId, action, approverId } = payload;

  if (!['approve-direct', 'approve-final', 'reject', 'revision'].includes(action)) {
    return res.status(400).send(renderEmailActionPage('error', 'Aksi tidak valid'));
  }

  try {
    const recordResult = await query('SELECT * FROM overtime_records WHERE id = $1', [recordId]);
    const record = recordResult.rows[0];

    if (!record) return res.send(renderEmailActionPage('error', 'Record tidak ditemukan'));
    if (record.status !== 'pending') {
      return res.send(renderEmailActionPage('info', `Pengajuan ${record.employee_name} sudah diproses sebelumnya (status: ${record.status})`));
    }

    const approverResult = await query('SELECT full_name, level FROM users WHERE id = $1', [approverId]);
    const approver = approverResult.rows[0];
    const approverName = approver?.full_name || 'Atasan';
    const approverLevel = levelNum(approver?.level);

    if (action === 'reject') {
      await query(
        `UPDATE overtime_records SET status = 'rejected', approval_note = $1,
         rejected_at = NOW(), approval_progress = 0, updated_at = NOW() WHERE id = $2`,
        [`Ditolak oleh ${approverName}`, recordId]
      );
      await notifyUser(record.employee_id, 'rejected', {
        date: record.date, startTime: record.start_time,
        note: `Ditolak oleh ${approverName}`, rejectedBy: approverName,
        reason: record.reason, desc: record.description  // ← TAMBAH
      });
      return res.send(renderEmailActionPage('rejected', `Pengajuan <strong>${record.employee_name}</strong> ditolak. Karyawan sudah dapat notifikasi.`));
    }

    if (action === 'revision') {
      await query(
        `UPDATE overtime_records SET status = 'revision', approval_note = $1,
         revision_count = revision_count + 1, approval_progress = 0, updated_at = NOW() WHERE id = $2`,
        [`Revisi diminta oleh ${approverName}`, recordId]
      );
      await notifyUser(record.employee_id, 'revision', {
        note: `Revisi diminta oleh ${approverName}`, requestedBy: approverName,
        reason: record.reason, desc: record.description  // ← TAMBAH
      });
      return res.send(renderEmailActionPage('forwarded', `Permintaan revisi terkirim ke <strong>${record.employee_name}</strong>.`));
    }

    if (action === 'approve-direct') {
      if (approverLevel < 3) {
        return res.send(renderEmailActionPage('error', 'Level kamu tidak cukup untuk approve'));
      }

      await query(
        `UPDATE overtime_records 
         SET direct_approver_id = $1, direct_approval_at = NOW(), direct_approval_note = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [approverId, `Disetujui oleh ${approverName} via email`, recordId]
      );

      await notifyUser(record.employee_id, 'partialApproval', {
        directApproverName: approverName,
        date: record.date, startTime: record.start_time
      });

      const chain = record.approval_chain || [];
      const allApproversResult = await query(
        'SELECT id, email, full_name, level FROM users WHERE id = ANY($1)',
        [chain]
      );
      const finalApprover = allApproversResult.rows.find(a => levelNum(a.level) >= 4);

      if (finalApprover?.email && finalApprover.id !== approverId) {
        const JWT_SECRET = process.env.JWT_SECRET;
        const BACKEND_URL = process.env.BACKEND_URL || 'https://overtime-backend-wd4c.onrender.com';
        const approveToken = jwt.sign(
          { recordId, action: 'approve-final', approverId: finalApprover.id },
          JWT_SECRET, { expiresIn: '24h' }
        );
        const rejectToken = jwt.sign(
          { recordId, action: 'reject', approverId: finalApprover.id },
          JWT_SECRET, { expiresIn: '24h' }
        );

        await sendEmail({
          to: finalApprover.email,
          ...templates.directApprovedNotifyFinal({
            employeeName: record.employee_name,
            directApproverName: approverName,
            directApprovedAt: new Date().toLocaleString('id-ID'),
            directNote: `Disetujui oleh ${approverName} via email`,
            date: record.date, startTime: record.start_time,
            duration: Math.round(parseFloat(record.planned_duration?.split(':')[0] || 2)),
            reason: record.reason, desc: record.description,  // ← TAMBAH
            approveUrl: `${BACKEND_URL}/api/approval/email-action?token=${approveToken}`,
            rejectUrl: `${BACKEND_URL}/api/approval/email-action?token=${rejectToken}`
          })
        });
      }

      return res.send(renderEmailActionPage('success', `Atasan langsung <strong>${approverName}</strong> approve. Sekarang menunggu final approval dari Manager.`));
    }

    if (action === 'approve-final') {
      if (approverLevel < 4) {
        return res.send(renderEmailActionPage('error', `Hanya level 4+ (Manager) yang bisa final approve. Level kamu: ${approver?.level || '-'}`));
      }

      const jumpedIn = !record.direct_approver_id;
      
      await query(
        `UPDATE overtime_records 
         SET status = 'approved', 
             final_approver_id = $1, final_approval_at = NOW(),
             approved_by = $1, approved_at = NOW(),
             jumped_in = $2,
             approval_note = $3,
             updated_at = NOW()
         WHERE id = $4`,
        [
          approverId, jumpedIn,
          jumpedIn ? `Disetujui langsung oleh ${approverName} (atasan langsung belum review)` : `Disetujui final oleh ${approverName}`,
          recordId
        ]
      );

      if (jumpedIn) {
        await notifyUser(record.employee_id, 'approvedJumpIn', {
          finalApproverName: approverName,
          directApproverName: '-',
          date: record.date, startTime: record.start_time
        });
      } else {
        await notifyUser(record.employee_id, 'approved', {
          finalApproverName: approverName,
          date: record.date, startTime: record.start_time
        });
      }

      if (jumpedIn) {
        const chain = record.approval_chain || [];
        if (chain.length > 0) {
          const directApproverId = chain[0];
          await notifyUser(directApproverId, 'jumpedInNotifyDirect', {
            employeeName: record.employee_name,
            finalApproverName: approverName,
            finalApprovedAt: new Date().toLocaleString('id-ID'),
            date: record.date
          });
        }
      }

      return res.send(renderEmailActionPage('success', `Pengajuan <strong>${record.employee_name}</strong> disetujui final.${jumpedIn ? ' <br><small>(Jump in — atasan langsung belum review)</small>' : ''}`));
    }

    return res.send(renderEmailActionPage('error', 'Aksi tidak dikenali'));

  } catch (err) {
    console.error('email-action error:', err.message);
    return res.status(500).send(renderEmailActionPage('error', 'Gagal: ' + err.message));
  }
});

router.post('/:id/approve-direct', requireAuth, requireManager, async (req, res) => {
  const { id } = req.params;
  const { note } = req.body;
  const user = req.user;
  const userLevel = levelNum(user.level);

  if (userLevel < 3) {
    return res.status(403).json({ error: 'Level minimal 3 (Supervisor) untuk approve' });
  }

  try {
    const result = await query(
      `UPDATE overtime_records 
       SET direct_approver_id = $1, direct_approval_at = NOW(), direct_approval_note = $2, updated_at = NOW()
       WHERE id = $3 AND status = 'pending'
       RETURNING *`,
      [user.id, note || null, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Tidak ditemukan / bukan pending' });

    const record = result.rows[0];
    
    await notifyUser(record.employee_id, 'partialApproval', {
      directApproverName: user.name,
      date: record.date, startTime: record.start_time
    });

    const chain = record.approval_chain || [];
    const allApproversResult = await query(
      'SELECT id, email, full_name, level FROM users WHERE id = ANY($1)',
      [chain]
    );
    const finalApprover = allApproversResult.rows.find(a => levelNum(a.level) >= 4);

    if (finalApprover?.email && finalApprover.id !== user.id) {
      const JWT_SECRET = process.env.JWT_SECRET;
      const BACKEND_URL = process.env.BACKEND_URL || 'https://overtime-backend-wd4c.onrender.com';
      const approveToken = jwt.sign(
        { recordId: id, action: 'approve-final', approverId: finalApprover.id },
        JWT_SECRET, { expiresIn: '24h' }
      );
      const rejectToken = jwt.sign(
        { recordId: id, action: 'reject', approverId: finalApprover.id },
        JWT_SECRET, { expiresIn: '24h' }
      );
      await sendEmail({
        to: finalApprover.email,
        ...templates.directApprovedNotifyFinal({
          employeeName: record.employee_name,
          directApproverName: user.name,
          directApprovedAt: new Date().toLocaleString('id-ID'),
          directNote: note || '-',
          date: record.date, startTime: record.start_time,
          duration: Math.round(parseFloat(record.planned_duration?.split(':')[0] || 2)),
          reason: record.reason, desc: record.description,  // ← TAMBAH
          approveUrl: `${BACKEND_URL}/api/approval/email-action?token=${approveToken}`,
          rejectUrl: `${BACKEND_URL}/api/approval/email-action?token=${rejectToken}`
        })
      });
    }

    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/approve-final', requireAuth, requireManager, async (req, res) => {
  const { id } = req.params;
  const { note } = req.body;
  const user = req.user;
  const userLevel = levelNum(user.level);

  if (userLevel < 4) {
    return res.status(403).json({ error: 'Level minimal 4 (Manager) untuk final approve' });
  }

  try {
    const recordResult = await query('SELECT * FROM overtime_records WHERE id = $1', [id]);
    const record = recordResult.rows[0];
    if (!record) return res.status(404).json({ error: 'Tidak ditemukan' });
    if (record.status !== 'pending') return res.status(400).json({ error: 'Bukan pending' });

    const jumpedIn = !record.direct_approver_id;

    await query(
      `UPDATE overtime_records 
       SET status = 'approved', final_approver_id = $1, final_approval_at = NOW(),
           approved_by = $1, approved_at = NOW(), jumped_in = $2,
           approval_note = $3, updated_at = NOW()
       WHERE id = $4`,
      [user.id, jumpedIn, note || null, id]
    );

    if (jumpedIn) {
      await notifyUser(record.employee_id, 'approvedJumpIn', {
        finalApproverName: user.name,
        date: record.date, startTime: record.start_time
      });
      const chain = record.approval_chain || [];
      if (chain.length > 0) {
        await notifyUser(chain[0], 'jumpedInNotifyDirect', {
          employeeName: record.employee_name,
          finalApproverName: user.name,
          finalApprovedAt: new Date().toLocaleString('id-ID'),
          date: record.date
        });
      }
    } else {
      await notifyUser(record.employee_id, 'approved', {
        finalApproverName: user.name,
        date: record.date, startTime: record.start_time
      });
    }

    res.json({ success: true, jumped_in: jumpedIn });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/reject', requireAuth, requireManager, async (req, res) => {
  const { id } = req.params;
  const { note } = req.body;
  const user = req.user;
  const userLevel = levelNum(user.level);

  if (userLevel < 3) return res.status(403).json({ error: 'Level minimal 3' });

  try {
    const result = await query(
      `UPDATE overtime_records SET status = 'rejected', approval_note = $1, rejected_at = NOW(),
       approval_progress = 0, updated_at = NOW()
       WHERE id = $2 AND status = 'pending' RETURNING *`,
      [note || `Ditolak oleh ${user.name}`, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Tidak ditemukan' });

    const record = result.rows[0];
    await notifyUser(record.employee_id, 'rejected', {
      date: record.date, startTime: record.start_time,
      note: note || `Ditolak oleh ${user.name}`, rejectedBy: user.name,
      reason: record.reason, desc: record.description  // ← TAMBAH
    });

    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/request-revision', requireAuth, requireManager, async (req, res) => {
  const { id } = req.params;
  const { note } = req.body;
  const user = req.user;
  const userLevel = levelNum(user.level);

  if (userLevel < 3) return res.status(403).json({ error: 'Level minimal 3' });
  if (!note) return res.status(400).json({ error: 'Catatan wajib' });

  try {
    const result = await query(
      `UPDATE overtime_records SET status = 'revision', approval_note = $1,
       revision_count = revision_count + 1, approval_progress = 0, updated_at = NOW()
       WHERE id = $2 AND status = 'pending' RETURNING *`,
      [note, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Tidak ditemukan' });

    const record = result.rows[0];
    await notifyUser(record.employee_id, 'revision', {
      note, requestedBy: user.name
      reason: record.reason, desc: record.description
    });

    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/reopen', requireAuth, requireManager, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await query(
      `UPDATE overtime_records SET status = 'pending', approval_progress = 0,
       approval_note = COALESCE(approval_note, '') || E'\n[Dibuka kembali ' || NOW() || ']',
       direct_approver_id = NULL, direct_approval_at = NULL,
       final_approver_id = NULL, final_approval_at = NULL, jumped_in = FALSE,
       updated_at = NOW()
       WHERE id = $1 AND status IN ('rejected', 'revision') RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Tidak ditemukan' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/verify-result', requireAuth, requireManager, async (req, res) => {
  const { id } = req.params;
  const { action, rating, note } = req.body;
  const user = req.user;
  const userLevel = levelNum(user.level);

  if (userLevel < 4) return res.status(403).json({ error: 'Level minimal 4 untuk verifikasi hasil' });
  if (!action) return res.status(400).json({ error: 'Action wajib' });

  let status, updateSql, params;

  if (action === 'approve') {
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating 1-5 wajib' });
    status = 'completed';
    updateSql = `UPDATE overtime_records
                 SET status = $1, verified_by = $2, verified_at = NOW(),
                     verify_rating = $3, verify_note = $4, verified_by_level = $5, updated_at = NOW()
                 WHERE id = $6 AND status = 'pending_verification' RETURNING *`;
    params = [status, user.id, rating, note || null, user.level, id];
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
    params = [status, note, user.id, id];
  } else {
    return res.status(400).json({ error: 'Action tidak valid' });
  }

  try {
    const result = await query(updateSql, params);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Tidak ditemukan' });

    const record = result.rows[0];
    if (action === 'approve') {
      await notifyUser(record.employee_id, 'verifyApproved', { 
        rating,
        date: record.date, startTime: record.start_time,        // ← TAMBAH
        reason: record.reason, desc: record.description          // ← TAMBAH
      });
    } else if (action === 'revision') {
      await notifyUser(record.employee_id, 'proofRevision', { 
        note,
        reason: record.reason, desc: record.description          // ← TAMBAH
      });
    } else if (action === 'reject') {
      await notifyUser(record.employee_id, 'verifyRejected', { 
        note,
        reason: record.reason, desc: record.description          // ← TAMBAH
      });
    }

    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
