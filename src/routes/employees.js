import { Router } from 'express';
import { pool, query } from '../db.js';
import { logActivity } from '../utils/logger.js';
import { sendError } from '../utils/errorResponse.js';
import { authenticate, requireRole, optionalAuth } from '../middleware/auth.js';

const router = Router();

// In-memory cache for employees (60s TTL)
let employeesCache = null;
let employeesCacheExpires = 0;
const CACHE_TTL_MS = 60 * 1000;

export function invalidateEmployeesCache() {
  employeesCache = null;
  employeesCacheExpires = 0;
}

// 1. List all employees / PIC
router.get('/', optionalAuth, async (req, res) => {
  const { department, search, active_only } = req.query;
  try {
    const now = Date.now();
    if (!department && !search && (!active_only || active_only === 'true') && employeesCache && now < employeesCacheExpires) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(employeesCache);
    }

    let q = `
      SELECT e.*,
        (SELECT COUNT(*) FROM assets a WHERE a.assigned_to_employee_id = e.id) as assigned_asset_count
      FROM employees e
      WHERE 1=1
    `;
    const params = [];

    if (active_only !== 'false') {
      q += ` AND e.is_active = TRUE`;
    }
    if (department) {
      params.push(department);
      q += ` AND e.department = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      q += ` AND (e.name ILIKE $${params.length} OR e.nik ILIKE $${params.length} OR e.department ILIKE $${params.length})`;
    }

    q += ` ORDER BY e.department ASC, e.name ASC`;

    const result = await query(q, params);

    if (!department && !search && (!active_only || active_only === 'true')) {
      employeesCache = result.rows;
      employeesCacheExpires = now + CACHE_TTL_MS;
      res.setHeader('X-Cache', 'MISS');
    }

    res.json(result.rows);
  } catch (err) {
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  }
});

// 2. Create employee / PIC
router.post('/', authenticate, requireRole('admin', 'ga', 'it', 'hrd'), async (req, res) => {
  const { nik, name, department, position, phone_number } = req.body;
  if (!name || !name.trim()) {
    return sendError(res, 400, 'Nama karyawan/PIC wajib diisi.', 'VALIDATION_ERROR');
  }
  if (!department || !department.trim()) {
    return sendError(res, 400, 'Bagian/Departemen wajib diisi.', 'VALIDATION_ERROR');
  }

  try {
    const result = await query(
      `INSERT INTO employees (nik, name, department, position, phone_number)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        nik?.trim() || null,
        name.trim(),
        department.trim(),
        position?.trim() || null,
        phone_number?.trim() || null
      ]
    );
    invalidateEmployeesCache();
    await logActivity(req.user?.name || 'Admin', 'CREATE_EMPLOYEE', 'PIC', result.rows[0].id, `Menambah PIC: ${name} (${department})`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return sendError(res, 409, `NIK "${nik}" sudah terdaftar pada karyawan lain.`, 'CONFLICT');
    }
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  }
});

// 2b. Batch Import employees / PIC
router.post('/batch-import', authenticate, requireRole('admin', 'ga', 'it', 'hrd'), async (req, res) => {
  const { items = [], overwriteExisting = false } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return sendError(res, 400, 'Data PIC / karyawan untuk diimpor tidak boleh kosong.', 'VALIDATION_ERROR');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const imported = [];
    const updated = [];
    const skipped = [];

    for (const item of items) {
      const nik = item.nik ? String(item.nik).trim() : null;
      const name = String(item.name || '').trim();
      const department = String(item.department || '').trim();
      const position = item.position ? String(item.position).trim() : null;
      const phone_number = item.phone_number ? String(item.phone_number).trim() : null;

      if (!name || !department) {
        skipped.push({ nik: nik || '-', name: name || '-', reason: 'Nama atau Bagian/Departemen wajib diisi' });
        continue;
      }

      let exist = { rows: [] };
      if (nik) {
        exist = await client.query(`SELECT id FROM employees WHERE LOWER(nik) = LOWER($1)`, [nik]);
      } else {
        exist = await client.query(`SELECT id FROM employees WHERE LOWER(name) = LOWER($1) AND LOWER(department) = LOWER($2)`, [name, department]);
      }

      if (exist.rows.length > 0) {
        if (!overwriteExisting) {
          skipped.push({ nik: nik || '-', name, reason: 'Karyawan/NIK sudah terdaftar' });
          continue;
        }
        await client.query(
          `UPDATE employees SET nik = COALESCE($1, nik), name = $2, department = $3, position = $4, phone_number = $5, is_active = TRUE WHERE id = $6`,
          [nik, name, department, position, phone_number, exist.rows[0].id]
        );
        updated.push(name);
      } else {
        const ins = await client.query(
          `INSERT INTO employees (nik, name, department, position, phone_number) VALUES ($1, $2, $3, $4, $5) RETURNING id, nik, name`,
          [nik, name, department, position, phone_number]
        );
        imported.push(ins.rows[0]);
      }
    }

    await client.query('COMMIT');
    invalidateEmployeesCache();
    await logActivity(req.user?.name || 'Admin', 'IMPORT_EMPLOYEES', 'PIC', null, `Import ${imported.length} PIC baru, update ${updated.length}, lewati ${skipped.length}`);

    res.json({
      message: `Impor PIC selesai: ${imported.length} baru${updated.length ? `, ${updated.length} diperbarui` : ''}${skipped.length ? `, ${skipped.length} dilewati` : ''}`,
      importedCount: imported.length,
      updatedCount: updated.length,
      skippedCount: skipped.length,
      skipped
    });
  } catch (err) {
    await client.query('ROLLBACK');
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  } finally {
    client.release();
  }
});

// 3. Update employee
router.put('/:id', authenticate, requireRole('admin', 'ga', 'it', 'hrd'), async (req, res) => {
  const { id } = req.params;
  const { nik, name, department, position, phone_number, is_active } = req.body;
  if (!name || !name.trim()) {
    return sendError(res, 400, 'Nama karyawan/PIC wajib diisi.', 'VALIDATION_ERROR');
  }
  if (!department || !department.trim()) {
    return sendError(res, 400, 'Bagian/Departemen wajib diisi.', 'VALIDATION_ERROR');
  }

  try {
    const result = await query(
      `UPDATE employees
       SET nik = $1, name = $2, department = $3, position = $4, phone_number = $5, is_active = COALESCE($6, is_active)
       WHERE id = $7 RETURNING *`,
      [
        nik?.trim() || null,
        name.trim(),
        department.trim(),
        position?.trim() || null,
        phone_number?.trim() || null,
        typeof is_active === 'boolean' ? is_active : null,
        id
      ]
    );
    if (result.rows.length === 0) {
      return sendError(res, 404, 'Data karyawan tidak ditemukan.', 'NOT_FOUND');
    }
    invalidateEmployeesCache();
    await logActivity(req.user?.name || 'Admin', 'UPDATE_EMPLOYEE', 'PIC', id, `Mengubah PIC: ${name}`);
    res.json(result.rows[0]);
  } catch (err) {
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  }
});

// 4. Delete employee (soft delete or hard delete if no assets attached)
router.delete('/:id', authenticate, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  try {
    const assetCheck = await query(`SELECT COUNT(*) as count FROM assets WHERE assigned_to_employee_id = $1`, [id]);
    if (parseInt(assetCheck.rows[0].count, 10) > 0) {
      // Soft-delete if assets are still assigned
      await query(`UPDATE employees SET is_active = FALSE WHERE id = $1`, [id]);
      invalidateEmployeesCache();
      return res.json({ message: 'Karyawan dinonaktifkan karena masih memegang aset.' });
    }

    const emp = await query(`SELECT name FROM employees WHERE id = $1`, [id]);
    if (emp.rows.length === 0) {
      return sendError(res, 404, 'Karyawan tidak ditemukan.', 'NOT_FOUND');
    }
    await query(`DELETE FROM employees WHERE id = $1`, [id]);
    invalidateEmployeesCache();
    await logActivity(req.user?.name || 'Admin', 'DELETE_EMPLOYEE', 'PIC', id, `Menghapus PIC: ${emp.rows[0]?.name}`);
    res.json({ message: 'Karyawan berhasil dihapus' });
  } catch (err) {
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  }
});

export default router;
