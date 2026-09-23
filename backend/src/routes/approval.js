import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireManager } from '../auth.js';
import { sendEmail, templates } from '../mailer.js';

const router = Router();

function levelNum(level) {
  if (!level) return 0;
  const match = String(level).match(/^(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

// Approve jadwal — dengan chain
router.post('/:id/approve-schedule', requireAuth, requireManager, async (req, res) => {
  const { id } = req.params;
  const { note } = req.body;
  const user = req.user;

  try {
    const recordResult = await query('SELECT * FROM overtime_records WHERE id = $1', [id]);
    const record = recordResult.rows[0];
    if (!record) return res.status(404).json({ error: 'Tidak ditemukan' });
    if (record.status !== 'pending') return res.status(400).json({ error: 'Status bukan pending' });

    const chain = record.approval_chain || [];
    const progress = record.approval_progress || 0;

    // Cek apakah user adalah approver saat ini di chain
    if (chain.length > 0 && chain[progress] !== user.id) {
      return res.status(403).json({ error: 'Bukan giliran kamu untuk approve' });
    }

    const nextProgress = progress + 1;
    const isFinal = nextProgress >= chain.length || levelNum(user.level) >= 4;

    if (isFinal) {
      // Approve final
      await query(
        `UPDATE overtime_records
         SET status = 'approved', approved_by = $1, approved_at = NOW(),
             approval_note = $2, approval_progress = $3, updated_at = NOW()
         WHERE id = $4`,
        [user.id, note || null, nextProgress, id]
      );

      const emp = await query('SELECT email FROM users WHERE id = $1', [record.employee_id]);
      if (emp.rows[0]) {
        await sendEmail({
          to: emp.rows[0].email,
          ...templates.approved({ date: record.date, startTime: record.start_time })
        });
      }
    } else {
      // Approve bertingkat — teruskan ke approver berikutnya
      await query(
        `UPDATE overtime_records
         SET approval_progress = $1, approval_note = $2, updated_at = NOW()
         WHERE id = $3`,
        [nextProgress, note || null, id]
      );

      const nextApproverId = chain[nextProgress];
      const nextApprover = await query('SELECT email, full_name FROM users WHERE id = $1', [nextApproverId]);
      if (nextApprover.rows[0]) {
        await sendEmail({
          to: nextApprover.rows[0].email,
          ...templates.newRequest({
            employeeName: record.employee_name,
            date: record.date,
            startTime: record.start_time,
            duration: record.planned_duration,
            reason: record.reason,
            desc: record.description
          })
        });
      }
    }

    res.json({ success: true, final: isFinal });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

    const emp = await query('SELECT email FROM users WHERE id = $1', [result.rows[0].employee_id]);
    if (emp.rows[0]) {
      await sendEmail({
        to: emp.rows[0].email,
        ...templates.rejected({
          date: result.rows[0].date,
          startTime: result.rows[0].start_time,
          note: note || 'Ditolak'
        })
      });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

    const emp = await query('SELECT email FROM users WHERE id = $1', [result.rows[0].employee_id]);
    if (emp.rows[0]) {
      await sendEmail({ to: emp.rows[0].email, ...templates.revision({ note }) });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/reopen', requireAuth, requireManager, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await query(
      `UPDATE overtime_records
       SET status = 'pending', approval_progress = 0,
           approval_note = COALESCE(approval_note, '') || E'\\n[Dibuka kembali ' || NOW() || ']',
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

// Verifikasi hasil — dengan hierarki level
router.post('/:id/verify-result', requireAuth, requireManager, async (req, res) => {
  const { id } = req.params;
  const { action, rating, note } = req.body;
  const user = req.user;
  const userLevel = levelNum(user.level);

  if (!action) return res.status(400).json({ error: 'Action wajib' });

  // Cek apakah user berhak verifikasi
  const recordResult = await query('SELECT * FROM overtime_records WHERE id = $1', [id]);
  const record = recordResult.rows[0];
  if (!record) return res.status(404).json({ error: 'Tidak ditemukan' });

  // Level >= 4a bisa verifikasi apapun. Level < 4a hanya bisa verifikasi bawahannya
  if (userLevel < 4) {
    const chain = record.approval_chain || [];
    if (!chain.includes(user.id)) {
      return res.status(403).json({ error: 'Kamu tidak berhak verifikasi ini' });
    }
  }

  let status, updateSql, params;

  if (action === 'approve') {
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating 1-5 wajib' });
    }
    status = 'completed';
    updateSql = `UPDATE overtime_records
                 SET status = $1, verified_by = $2, verified_at = NOW(),
                     verify_rating = $3, verify_note = $4, verified_by_level = $5, updated_at = NOW()
                 WHERE id = $6 AND status = 'pending_verification'
                 RETURNING *`;
    params = [status, user.id, rating, note || null, user.level, id];
  } else if (action === 'revision') {
    if (!note) return res.status(400).json({ error: 'Catatan wajib' });
    status = 'proof_revision';
    updateSql = `UPDATE overtime_records
                 SET status = $1, verify_note = $2,
                     proof_revision_count = proof_revision_count + 1, updated_at = NOW()
                 WHERE id = $3 AND status = 'pending_verification'
                 RETURNING *`;
    params = [status, note, id];
  } else if (action === 'reject') {
    if (!note) return res.status(400).json({ error: 'Alasan wajib' });
    status = 'verify_rejected';
    updateSql = `UPDATE overtime_records
                 SET status = $1, verify_note = $2, verified_by = $3, verified_at = NOW(), updated_at = NOW()
                 WHERE id = $4 AND status = 'pending_verification'
                 RETURNING *`;
    params = [status, note, user.id, id];
  } else {
    return res.status(400).json({ error: 'Action tidak valid' });
  }

  try {
    const result = await query(updateSql, params);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Tidak ditemukan' });

    const emp = await query('SELECT email FROM users WHERE id = $1', [result.rows[0].employee_id]);
    if (emp.rows[0]) {
      if (action === 'approve') {
        await sendEmail({ to: emp.rows[0].email, ...templates.verifyApproved({ rating }) });
      } else if (action === 'revision') {
        await sendEmail({ to: emp.rows[0].email, ...templates.proofRevision({ note }) });
      } else if (action === 'reject') {
        await sendEmail({ to: emp.rows[0].email, ...templates.verifyRejected({ note }) });
      }
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
