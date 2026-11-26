import { Router } from 'express';
import { pool, query } from '../db.js';
import { logActivity } from '../utils/logger.js';
import { sendError } from '../utils/errorResponse.js';

const router = Router();

const ALLOWED_TASK_TYPES = new Set([
  'cuci_ac',
  'cleaning_printer',
  'cleaning_pc',
  'cleaning_laptop',
  'service_berkala',
  'perbaikan',
  'ganti_oli',
  'other'
]);

const ALLOWED_EXECUTORS = new Set(['internal', 'vendor']);

function normalizeTaskType(raw) {
  const t = String(raw || 'other').toLowerCase().trim();
  return ALLOWED_TASK_TYPES.has(t) ? t : 'other';
}

function normalizeExecutor(raw) {
  const e = String(raw || 'internal').toLowerCase().trim();
  return ALLOWED_EXECUTORS.has(e) ? e : 'internal';
}

// ============================================================
// 1. LIST MAINTENANCE SCHEDULES & KPI SUMMARY
// ============================================================
router.get('/schedules', async (req, res) => {
  const { due_filter = 'all', task_type, search } = req.query;
  try {
    const params = [];
    let whereSql = 'WHERE ms.is_active = TRUE';

    if (task_type) {
      params.push(task_type);
      whereSql += ` AND ms.task_type = $${params.length}`;
    }
    if (search) {
      params.push(`%${search.trim()}%`);
      whereSql += ` AND (a.name ILIKE $${params.length} OR a.code ILIKE $${params.length} OR COALESCE(ms.default_vendor, '') ILIKE $${params.length} OR COALESCE(l.name, a.location, '') ILIKE $${params.length})`;
    }
    if (due_filter === 'overdue') {
      whereSql += ` AND ms.next_due_date < CURRENT_DATE`;
    } else if (due_filter === 'due_soon') {
      whereSql += ` AND ms.next_due_date >= CURRENT_DATE AND ms.next_due_date <= (CURRENT_DATE + INTERVAL '14 days')`;
    } else if (due_filter === 'due_or_overdue') {
      whereSql += ` AND ms.next_due_date <= (CURRENT_DATE + INTERVAL '14 days')`;
    }

    const [schedRes, kpiRes] = await Promise.all([
      query(`
        SELECT
          ms.*,
          a.code as asset_code,
          a.name as asset_name,
          a.category as asset_category,
          a.subcategory as asset_subcategory,
          a.status as asset_status,
          COALESCE(l.name, a.location) as asset_location,
          e.name as employee_name,
          (ms.next_due_date - CURRENT_DATE)::int as days_remaining,
          CASE
            WHEN ms.next_due_date < CURRENT_DATE THEN 'overdue'
            WHEN ms.next_due_date <= (CURRENT_DATE + INTERVAL '14 days') THEN 'due_soon'
            ELSE 'upcoming'
          END as due_status
        FROM maintenance_schedules ms
        JOIN assets a ON ms.asset_id = a.id
        LEFT JOIN locations l ON a.location_id = l.id
        LEFT JOIN employees e ON a.assigned_to_employee_id = e.id
        ${whereSql}
        ORDER BY ms.next_due_date ASC, ms.id ASC
      `, params),
      query(`
        SELECT
          (SELECT COUNT(*)::int FROM maintenance_schedules WHERE is_active = TRUE AND next_due_date < CURRENT_DATE) as overdue_count,
          (SELECT COUNT(*)::int FROM maintenance_schedules WHERE is_active = TRUE AND next_due_date >= CURRENT_DATE AND next_due_date <= (CURRENT_DATE + INTERVAL '14 days')) as due_soon_count,
          (SELECT COUNT(*)::int FROM asset_maintenances WHERE DATE_TRUNC('month', maintenance_date) = DATE_TRUNC('month', CURRENT_DATE)) as done_month_count,
          (SELECT COALESCE(SUM(cost), 0)::numeric FROM asset_maintenances WHERE DATE_TRUNC('month', maintenance_date) = DATE_TRUNC('month', CURRENT_DATE)) as cost_month_total
      `)
    ]);

    res.json({
      kpi: kpiRes.rows[0],
      schedules: schedRes.rows
    });
  } catch (err) {
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  }
});

// ============================================================
// 2. CREATE PREVENTIVE MAINTENANCE SCHEDULE
// ============================================================
router.post('/schedules', async (req, res) => {
  const {
    asset_id,
    task_type,
    interval_months = 3,
    next_due_date,
    executor_type = 'internal',
    default_vendor,
    estimated_cost = 0,
    notes,
    userName
  } = req.body;

  const assetId = parseInt(asset_id, 10);
  const interval = parseInt(interval_months, 10);
  if (!assetId) {
    return sendError(res, 400, 'Aset wajib dipilih.', 'VALIDATION_ERROR');
  }
  if (!task_type) {
    return sendError(res, 400, 'Jenis pekerjaan maintenance wajib dipilih.', 'VALIDATION_ERROR');
  }
  if (isNaN(interval) || interval < 1 || interval > 60) {
    return sendError(res, 400, 'Interval pengulangan harus antara 1 sampai 60 bulan.', 'VALIDATION_ERROR');
  }
  if (!next_due_date || !/^\d{4}-\d{2}-\d{2}$/.test(String(next_due_date))) {
    return sendError(res, 400, 'Tanggal jatuh tempo (YYYY-MM-DD) wajib valid.', 'VALIDATION_ERROR');
  }

  const finalTask = normalizeTaskType(task_type);
  const finalExecutor = normalizeExecutor(executor_type);
  const finalCost = Math.max(0, parseFloat(estimated_cost) || 0);

  try {
    const assetRes = await query(`SELECT id, code, name FROM assets WHERE id = $1`, [assetId]);
    if (assetRes.rows.length === 0) {
      return sendError(res, 404, 'Aset tidak ditemukan.', 'NOT_FOUND');
    }

    const result = await query(
      `INSERT INTO maintenance_schedules (
         asset_id, task_type, interval_months, next_due_date, executor_type, default_vendor, estimated_cost, notes
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        assetId,
        finalTask,
        interval,
        next_due_date,
        finalExecutor,
        default_vendor?.trim() || null,
        finalCost,
        notes?.trim() || null
      ]
    );

    const a = assetRes.rows[0];
    await logActivity(userName || 'Admin', 'CREATE_MAINT_SCHEDULE', 'ASSET', assetId, `Membuat jadwal [${finalTask}] tiap ${interval} bln untuk [${a.code}] ${a.name}`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  }
});

// ============================================================
// 3. COMPLETE SCHEDULED MAINTENANCE (1-CLICK + AUTO ADVANCE)
// ============================================================
router.post('/schedules/:id/complete', async (req, res) => {
  const { id } = req.params;
  const {
    maintenance_date,
    executor_type,
    vendor,
    performed_by,
    cost = 0,
    notes,
    mark_asset_repair = false,
    userName
  } = req.body;

  const doneDate = maintenance_date && /^\d{4}-\d{2}-\d{2}$/.test(String(maintenance_date))
    ? maintenance_date
    : new Date().toISOString().slice(0, 10);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const schedRes = await client.query(
      `SELECT ms.*, a.code as asset_code, a.name as asset_name
       FROM maintenance_schedules ms
       JOIN assets a ON ms.asset_id = a.id
       WHERE ms.id = $1 FOR UPDATE`,
      [id]
    );

    if (schedRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return sendError(res, 404, 'Jadwal maintenance tidak ditemukan.', 'NOT_FOUND');
    }

    const sched = schedRes.rows[0];
    const finalExecutor = normalizeExecutor(executor_type || sched.executor_type);
    const finalCost = finalExecutor === 'internal' ? Math.max(0, parseFloat(cost) || 0) : Math.max(0, parseFloat(cost) ?? parseFloat(sched.estimated_cost) ?? 0);
    const finalVendor = vendor?.trim() || (finalExecutor === 'vendor' ? sched.default_vendor : 'Tim Internal IT/GA');
    const finalPerformer = performed_by?.trim() || userName || 'Admin';
    const statusImpact = mark_asset_repair ? 'maintenance' : 'none';

    // 1. Record completed log in asset_maintenances
    const logRes = await client.query(
      `INSERT INTO asset_maintenances (
         asset_id, maintenance_date, type, cost, vendor, notes, schedule_id, executor_type, performed_by, status_impact
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        sched.asset_id,
        doneDate,
        sched.task_type,
        finalCost,
        finalVendor,
        notes?.trim() || `Perawatan berkala [${sched.task_type}] selesai dilaksanakan`,
        sched.id,
        finalExecutor,
        finalPerformer,
        statusImpact
      ]
    );

    // 2. Advance next_due_date cleanly by interval_months
    const updSched = await client.query(
      `UPDATE maintenance_schedules
       SET last_done_date = $1::date,
           next_due_date = ($1::date + make_interval(months => interval_months))::date,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [doneDate, sched.id]
    );

    // 3. Routine cleaning leaves active status intact; only mark repair if explicitly checked
    if (mark_asset_repair === true) {
      await client.query(
        `UPDATE assets SET status = 'maintenance', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [sched.asset_id]
      );
    }

    await client.query(
      `INSERT INTO activity_logs (user_name, action, target_type, target_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        userName || finalPerformer,
        'COMPLETE_MAINT_SCHEDULE',
        'ASSET',
        sched.asset_id,
        `[${sched.asset_code}] Selesai ${sched.task_type} (${finalExecutor}, Rp ${finalCost}). Jadwal berikutnya: ${updSched.rows[0].next_due_date.toISOString().slice(0, 10)}`
      ]
    );

    await client.query('COMMIT');
    res.json({
      message: `Perawatan [${sched.asset_code}] selesai dicatat & jadwal berikutnya diperbarui`,
      log: logRes.rows[0],
      schedule: updSched.rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  } finally {
    client.release();
  }
});

// ============================================================
// 4. DELETE SCHEDULE
// ============================================================
router.delete('/schedules/:id', async (req, res) => {
  const { id } = req.params;
  const userName = req.query.userName || 'Admin';
  try {
    const cur = await query(`SELECT ms.id, ms.task_type, a.code FROM maintenance_schedules ms JOIN assets a ON ms.asset_id = a.id WHERE ms.id = $1`, [id]);
    if (cur.rows.length === 0) {
      return sendError(res, 404, 'Jadwal maintenance tidak ditemukan.', 'NOT_FOUND');
    }
    await query(`DELETE FROM maintenance_schedules WHERE id = $1`, [id]);
    await logActivity(userName, 'DELETE_MAINT_SCHEDULE', 'ASSET', null, `Menghapus jadwal [${cur.rows[0].task_type}] aset ${cur.rows[0].code}`);
    res.json({ message: 'Jadwal maintenance berhasil dihapus' });
  } catch (err) {
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  }
});

// ============================================================
// 5. ALL MAINTENANCE LOGS (CROSS-ASSET HISTORY & COST REPORT)
// ============================================================
router.get('/logs', async (req, res) => {
  const { month, task_type, executor_type } = req.query;
  try {
    const params = [];
    let whereSql = 'WHERE 1=1';

    if (month && /^\d{4}-\d{2}$/.test(month)) {
      params.push(`${month}-01`);
      whereSql += ` AND m.maintenance_date >= $${params.length}::date AND m.maintenance_date < ($${params.length}::date + INTERVAL '1 month')`;
    }
    if (task_type) {
      params.push(task_type);
      whereSql += ` AND m.type = $${params.length}`;
    }
    if (executor_type) {
      params.push(executor_type);
      whereSql += ` AND COALESCE(m.executor_type, 'internal') = $${params.length}`;
    }

    const result = await query(`
      SELECT
        m.*,
        a.code as asset_code,
        a.name as asset_name,
        a.category as asset_category,
        a.subcategory as asset_subcategory,
        COALESCE(l.name, a.location) as asset_location
      FROM asset_maintenances m
      JOIN assets a ON m.asset_id = a.id
      LEFT JOIN locations l ON a.location_id = l.id
      ${whereSql}
      ORDER BY m.maintenance_date DESC, m.id DESC
    `, params);

    const rows = result.rows;
    const totalCost = rows.reduce((sum, r) => sum + (parseFloat(r.cost) || 0), 0);
    res.json({
      summary: {
        total_logs: rows.length,
        total_cost: totalCost,
        internal_count: rows.filter(r => (r.executor_type || 'internal') === 'internal').length,
        vendor_count: rows.filter(r => r.executor_type === 'vendor').length
      },
      logs: rows
    });
  } catch (err) {
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  }
});

// Ad-hoc maintenance log creation from centralized Maintenance menu
router.post('/logs', async (req, res) => {
  const {
    asset_id,
    maintenance_date,
    type,
    executor_type = 'internal',
    cost = 0,
    vendor,
    performed_by,
    notes,
    mark_asset_repair = false,
    userName
  } = req.body;

  const assetId = parseInt(asset_id, 10);
  if (!assetId || !type) {
    return sendError(res, 400, 'Aset dan jenis pekerjaan wajib dipilih.', 'VALIDATION_ERROR');
  }

  const finalType = normalizeTaskType(type);
  const finalExecutor = normalizeExecutor(executor_type);
  const finalCost = Math.max(0, parseFloat(cost) || 0);
  const doneDate = maintenance_date && /^\d{4}-\d{2}-\d{2}$/.test(String(maintenance_date))
    ? maintenance_date
    : new Date().toISOString().slice(0, 10);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const assetRes = await client.query(`SELECT id, code, name FROM assets WHERE id = $1`, [assetId]);
    if (assetRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return sendError(res, 404, 'Aset tidak ditemukan.', 'NOT_FOUND');
    }

    const ins = await client.query(
      `INSERT INTO asset_maintenances (
         asset_id, maintenance_date, type, cost, vendor, notes, executor_type, performed_by, status_impact
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        assetId,
        doneDate,
        finalType,
        finalCost,
        vendor?.trim() || (finalExecutor === 'internal' ? 'Tim Internal IT/GA' : null),
        notes?.trim() || null,
        finalExecutor,
        performed_by?.trim() || userName || 'Admin',
        mark_asset_repair ? 'maintenance' : 'none'
      ]
    );

    if (mark_asset_repair === true) {
      await client.query(`UPDATE assets SET status = 'maintenance', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [assetId]);
    }

    await client.query(
      `INSERT INTO activity_logs (user_name, action, target_type, target_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [userName || 'Admin', 'MAINTENANCE_LOG', 'ASSET', assetId, `[${assetRes.rows[0].code}] Mencatat ${finalType} (${finalExecutor}, Rp ${finalCost})`]
    );

    await client.query('COMMIT');
    res.status(201).json(ins.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  } finally {
    client.release();
  }
});

export default router;
