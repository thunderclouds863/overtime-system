import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireManager } from '../auth.js';
import { sendEmail, templates } from '../mailer.js';

const router = Router();

// ============================================
// FASE 1: Approve jadwal
// ============================================
router.post('/:id/approve-schedule', requireAuth, requireManager, async (req, res) => {
  const { id } = req.params;
  const { note } = req.body;

  try {
    const result = await query(
      `UPDATE overtime_records
       SET status = 'approved',
           approved_by = $1,
           approved_at = NOW(),
           approval_note = $2,
           updated_at = NOW()
       WHERE id = $3 AND status = 'pending'
       RETURNING *`,
      [req.user.id, note || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Record tidak ditemukan' });
    }

    const record = result.rows[0];

    const emp = await query('SELECT email FROM users WHERE id = $1', [record.employee_id]);
    if (emp.rows[0]) {
      await sendEmail({
        to: emp.rows[0].email,
        ...templates.approved({
          date: record.date,
          startTime: record.start_time
        })
      });
    }

    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reject pengajuan
router.post('/:id/reject', requireAuth, requireManager, async (req, res) => {
  const { id } = req.params;
  const { note } = req.body;

  try {
    const result = await query(
      `UPDATE overtime_records
       SET status = 'rejected',
           approval_note = $1,
           updated_at = NOW()
       WHERE id = $2 AND status = 'pending'
       RETURNING *`,
      [note || 'Ditolak', id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Record tidak ditemukan' });
    }

    const record = result.rows[0];
    const emp = await query('SELECT email FROM users WHERE id = $1', [record.employee_id]);
    if (emp.rows[0]) {
      await sendEmail({
        to: emp.rows[0].email,
        ...templates.rejected({
          date: record.date,
          startTime: record.start_time,
          note: note || 'Ditolak'
        })
      });
    }

    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Minta revisi
router.post('/:id/request-revision', requireAuth, requireManager, async (req, res) => {
  const { id } = req.params;
  const { note } = req.body;

  if (!note) return res.status(400).json({ error: 'Catatan wajib' });

  try {
    const result = await query(
      `UPDATE overtime_records
       SET status = 'revision',
           approval_note = $1,
           revision_count = revision_count + 1,
           updated_at = NOW()
       WHERE id = $2 AND status = 'pending'
       RETURNING *`,
      [note, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Record tidak ditemukan' });
    }

    const record = result.rows[0];
    const emp = await query('SELECT email FROM users WHERE id = $1', [record.employee_id]);
    if (emp.rows[0]) {
      await sendEmail({
        to: emp.rows[0].email,
        ...templates.revision({ note })
      });
    }

    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Buka kembali record yang rejected/revision
router.post('/:id/reopen', requireAuth, requireManager, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await query(
      `UPDATE overtime_records
       SET status = 'pending',
           approval_note = COALESCE(approval_note, '') || E'\\n[Dibuka kembali ' || NOW() || ']',
           updated_at = NOW()
       WHERE id = $1 AND status IN ('rejected', 'revision')
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Record tidak ditemukan' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// FASE 3: Verifikasi hasil
// ============================================
router.post('/:id/verify-result', requireAuth, requireManager, async (req, res) => {
  const { id } = req.params;
  const { action, rating, note } = req.body;

  if (!action) return res.status(400).json({ error: 'Action wajib' });

  let status, updateSql, params;

  if (action === 'approve') {
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating 1-5 wajib' });
    }
    status = 'completed';
    updateSql = `UPDATE overtime_records
                 SET status = $1,
                     verified_by = $2,
                     verified_at = NOW(),
                     verify_rating = $3,
                     verify_note = $4,
                     updated_at = NOW()
                 WHERE id = $5 AND status = 'pending_verification'
                 RETURNING *`;
    params = [status, req.user.id, rating, note || null, id];
  } else if (action === 'revision') {
    if (!note) return res.status(400).json({ error: 'Catatan wajib' });
    status = 'proof_revision';
    updateSql = `UPDATE overtime_records
                 SET status = $1,
                     verify_note = $2,
                     proof_revision_count = proof_revision_count + 1,
                     updated_at = NOW()
                 WHERE id = $3 AND status = 'pending_verification'
                 RETURNING *`;
    params = [status, note, id];
  } else if (action === 'reject') {
    if (!note) return res.status(400).json({ error: 'Alasan wajib' });
    status = 'verify_rejected';
    updateSql = `UPDATE overtime_records
                 SET status = $1,
                     verify_note = $2,
                     verified_by = $3,
                     verified_at = NOW(),
                     updated_at = NOW()
                 WHERE id = $4 AND status = 'pending_verification'
                 RETURNING *`;
    params = [status, note, req.user.id, id];
  } else {
    return res.status(400).json({ error: 'Action tidak valid' });
  }

  try {
    const result = await query(updateSql, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Record tidak ditemukan' });
    }

    const record = result.rows[0];
    const emp = await query('SELECT email FROM users WHERE id = $1', [record.employee_id]);

    if (emp.rows[0]) {
      if (action === 'approve') {
        await sendEmail({
          to: emp.rows[0].email,
          ...templates.verifyApproved({ rating })
        });
      } else if (action === 'revision') {
        await sendEmail({
          to: emp.rows[0].email,
          ...templates.proofRevision({ note })
        });
      } else if (action === 'reject') {
        await sendEmail({
          to: emp.rows[0].email,
          ...templates.verifyRejected({ note })
        });
      }
    }

    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;