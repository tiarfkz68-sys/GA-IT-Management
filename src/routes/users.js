import { Router } from 'express';
import { query } from '../db.js';
import { hashPassword } from '../utils/auth.js';
import { logActivity } from '../utils/logger.js';
import { sendError } from '../utils/errorResponse.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();
const VALID_ROLES = ['admin', 'it', 'ga', 'hrd', 'finance', 'employee'];

// Must be logged in to view users
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await query(`SELECT id, name, email, role, is_active, created_at FROM users ORDER BY id ASC`);
    res.json(result.rows);
  } catch (err) {
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  }
});

// Admin or HRD only
router.post('/', authenticate, requireRole('admin', 'hrd'), async (req, res) => {
  const { name, email, password = 'password123', role = 'employee', is_active = true } = req.body;
  if (!name || !name.trim() || !email || !email.trim()) {
    return sendError(res, 400, 'Nama dan email wajib diisi.', 'VALIDATION_ERROR');
  }

  if (!VALID_ROLES.includes(role)) {
    return sendError(res, 422, `Peran tidak valid. Pilih dari: ${VALID_ROLES.join(', ')}`, 'INVALID_ROLE');
  }

  try {
    const hashed = hashPassword(password);
    const result = await query(
      `INSERT INTO users (name, email, password_hash, role, is_active)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, role, is_active, created_at`,
      [name.trim(), email.toLowerCase().trim(), hashed, role, is_active]
    );
    await logActivity(req.user.name, 'CREATE_USER', 'USER', result.rows[0].id, `Menambah pengguna: ${name.trim()} (${role})`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return sendError(res, 409, `Email "${email}" sudah terdaftar.`, 'CONFLICT');
    }
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  }
});

// Admin or HRD only
router.put('/:id', authenticate, requireRole('admin', 'hrd'), async (req, res) => {
  const { id } = req.params;
  const { name, email, role, is_active, password } = req.body;

  if (role && !VALID_ROLES.includes(role)) {
    return sendError(res, 422, `Peran tidak valid. Pilih dari: ${VALID_ROLES.join(', ')}`, 'INVALID_ROLE');
  }

  try {
    let q = `UPDATE users SET name = COALESCE($1, name), email = COALESCE($2, email), role = COALESCE($3, role), is_active = COALESCE($4, is_active)`;
    const params = [name ? name.trim() : null, email ? email.toLowerCase().trim() : null, role || null, is_active !== undefined ? is_active : null];

    if (password && password.trim().length > 0) {
      params.push(hashPassword(password));
      q += `, password_hash = $${params.length}`;
    }

    params.push(id);
    q += ` WHERE id = $${params.length} RETURNING id, name, email, role, is_active`;

    const result = await query(q, params);
    if (result.rows.length === 0) {
      return sendError(res, 404, 'User tidak ditemukan.', 'NOT_FOUND');
    }

    await logActivity(req.user.name, 'UPDATE_USER', 'USER', id, `Mengubah data user: ${result.rows[0]?.name}`);
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return sendError(res, 409, `Email "${email}" sudah digunakan user lain.`, 'CONFLICT');
    }
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  }
});

// Admin only can delete users
router.delete('/:id', authenticate, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  try {
    const user = await query(`SELECT name FROM users WHERE id = $1`, [id]);
    if (user.rows.length === 0) {
      return sendError(res, 404, 'User tidak ditemukan.', 'NOT_FOUND');
    }
    await query(`DELETE FROM users WHERE id = $1`, [id]);
    await logActivity(req.user.name, 'DELETE_USER', 'USER', id, `Menghapus user: ${user.rows[0]?.name} (ID: ${id})`);
    res.json({ message: 'User berhasil dihapus' });
  } catch (err) {
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  }
});

export default router;
