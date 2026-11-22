import { Router } from 'express';
import { query } from '../db.js';
import { logActivity } from '../utils/logger.js';
import { sendError } from '../utils/errorResponse.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        acc.*, 
        u.name as assigned_to_name,
        ast.code as linked_asset_code,
        ast.name as linked_asset_name
      FROM accessories acc
      LEFT JOIN users u ON acc.assigned_to_user_id = u.id
      LEFT JOIN assets ast ON acc.linked_asset_id = ast.id
      ORDER BY acc.id DESC
    `);
    res.json(result.rows);
  } catch (err) {
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  }
});

router.post('/', async (req, res) => {
  const { name, category, serial_number, status = 'available', linked_asset_id, assigned_to_user_id, userName } = req.body;
  if (!name || !name.trim()) {
    return sendError(res, 400, 'Nama aksesoris wajib diisi.', 'VALIDATION_ERROR');
  }

  try {
    const result = await query(
      `INSERT INTO accessories (name, category, serial_number, status, linked_asset_id, assigned_to_user_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name.trim(), category || 'other', serial_number || null, status, linked_asset_id || null, assigned_to_user_id || null]
    );
    await logActivity(userName || 'Admin', 'CREATE_ACCESSORY', 'ACCESSORY', result.rows[0].id, `Menambah aksesoris: ${name}`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const { userName } = req.query;
  try {
    const acc = await query(`SELECT name FROM accessories WHERE id = $1`, [id]);
    if (acc.rows.length === 0) {
      return sendError(res, 404, 'Aksesoris tidak ditemukan.', 'NOT_FOUND');
    }
    await query(`DELETE FROM accessories WHERE id = $1`, [id]);
    await logActivity(userName || 'Admin', 'DELETE_ACCESSORY', 'ACCESSORY', id, `Menghapus aksesoris ID: ${id}`);
    res.json({ message: 'Aksesoris berhasil dihapus' });
  } catch (err) {
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  }
});

export default router;
