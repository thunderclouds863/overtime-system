import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

router.post('/check', async (req, res) => {
  const now = new Date();
  const toleranceStart = new Date(now.getTime() - 60000);

  try {
    const dueResult = await query(
      `SELECT * FROM overtime_records
       WHERE status = 'approved'
         AND planned_start <= $1
         AND planned_start >= $2`,
      [now.toISOString(), toleranceStart.toISOString()]
    );

    const results = [];

    for (const record of dueResult.rows) {
      const updateResult = await query(
        `UPDATE overtime_records
         SET status = 'active',
             actual_start = NOW(),
             auto_started = TRUE,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [record.id]
      );

      if (updateResult.rows.length > 0) {
        await query(
          `INSERT INTO activity_logs (record_id, actor_id, actor_name, action, details)
           VALUES ($1, NULL, 'SYSTEM', 'auto_started', $2)`,
          [record.id, JSON.stringify({ planned_start: record.planned_start })]
        );

        results.push({
          id: record.id,
          employee: record.employee_name,
          success: true
        });
      }
    }

    res.json({
      message: `${results.length} record diproses`,
      timestamp: now.toISOString(),
      records: results
    });
  } catch (err) {
    console.error('Scheduler error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/status', async (req, res) => {
  try {
    const result = await query(
      `SELECT COUNT(*) as approved_count 
       FROM overtime_records 
       WHERE status = 'approved'`
    );
    res.json({
      scheduler: 'running',
      pending_auto_start: parseInt(result.rows[0].approved_count),
      server_time: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;