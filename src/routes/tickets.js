import { Router } from 'express';
import { query } from '../db.js';
import { logActivity } from '../utils/logger.js';
import { sendError } from '../utils/errorResponse.js';

const router = Router();

router.get('/', async (req, res) => {
  const { status, category, search } = req.query;
  try {
    let q = `
      SELECT 
        t.*, 
        u.name as requester_name,
        ast.code as related_asset_code,
        ast.name as related_asset_name
      FROM tickets t
      LEFT JOIN users u ON t.requester_id = u.id
      LEFT JOIN assets ast ON t.related_asset_id = ast.id
      WHERE 1=1
    `;
    const params = [];
    if (status) {
      params.push(status);
      q += ` AND t.status = $${params.length}`;
    }
    if (category) {
      params.push(category);
      q += ` AND t.category = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      q += ` AND (t.title ILIKE $${params.length} OR t.ticket_no ILIKE $${params.length})`;
    }
    q += ` ORDER BY CASE WHEN t.status = 'open' THEN 1 WHEN t.status = 'in_progress' THEN 2 ELSE 3 END, t.id DESC`;

    const result = await query(q, params);
    res.json(result.rows);
  } catch (err) {
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  }
});

router.post('/', async (req, res) => {
  const { title, description, category, priority = 'medium', requester_id, related_asset_id, userName } = req.body;
  if (!title || !title.trim()) {
    return sendError(res, 400, 'Judul tiket / pekerjaan wajib diisi.', 'VALIDATION_ERROR');
  }

  const ticket_no = `LOG-${Date.now().toString().slice(-4)}`;
  try {
    const result = await query(
      `INSERT INTO tickets (ticket_no, title, description, category, priority, status, requester_id, related_asset_id)
       VALUES ($1, $2, $3, $4, $5, 'open', $6, $7) RETURNING *`,
      [ticket_no, title.trim(), description || null, category || 'IT_SUPPORT', priority, requester_id || null, related_asset_id || null]
    );
    await logActivity(userName || 'User', 'CREATE_TICKET', 'TICKET', result.rows[0].id, `Membuat tiket logbook: [${ticket_no}] ${title}`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  }
});

router.patch('/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status, resolution_note, userName } = req.body;
  if (!status) {
    return sendError(res, 400, 'Status baru wajib ditentukan.', 'VALIDATION_ERROR');
  }

  try {
    const isResolved = status === 'resolved' || status === 'closed';
    const result = await query(
      `UPDATE tickets 
       SET status = $1, 
           resolution_note = COALESCE($2, resolution_note),
           resolved_at = CASE WHEN $3 = true THEN CURRENT_TIMESTAMP ELSE NULL END
       WHERE id = $4 RETURNING *`,
      [status, resolution_note || null, isResolved, id]
    );
    if (result.rows.length === 0) {
      return sendError(res, 404, 'Tiket tidak ditemukan.', 'NOT_FOUND');
    }
    await logActivity(userName || 'Admin', 'UPDATE_TICKET', 'TICKET', id, `Mengubah status tiket menjadi ${status}`);
    res.json(result.rows[0]);
  } catch (err) {
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const { userName } = req.query;
  try {
    const ticket = await query(`SELECT ticket_no FROM tickets WHERE id = $1`, [id]);
    if (ticket.rows.length === 0) {
      return sendError(res, 404, 'Tiket tidak ditemukan.', 'NOT_FOUND');
    }
    await query(`DELETE FROM tickets WHERE id = $1`, [id]);
    await logActivity(userName || 'Admin', 'DELETE_TICKET', 'TICKET', id, `Menghapus tiket ID: ${id}`);
    res.json({ message: 'Tiket berhasil dihapus' });
  } catch (err) {
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  }
});

export default router;
