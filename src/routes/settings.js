import { Router } from 'express';
import { query } from '../db.js';
import { logActivity } from '../utils/logger.js';
import { sendError } from '../utils/errorResponse.js';
import { authenticate, requireRole, optionalAuth } from '../middleware/auth.js';

const router = Router();

// ============================================================
// APP SETTINGS & BRANDING API
// ============================================================
router.get('/settings', optionalAuth, async (req, res) => {
  try {
    const result = await query(`SELECT key, value FROM app_settings`);
    const settings = {};
    result.rows.forEach(r => { settings[r.key] = r.value; });
    res.json(settings);
  } catch (err) {
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  }
});

// Admin only can change system settings
router.put('/settings', authenticate, requireRole('admin'), async (req, res) => {
  const { key, value } = req.body;
  if (!key || !value) {
    return sendError(res, 400, 'Key dan value wajib diisi.', 'VALIDATION_ERROR');
  }

  try {
    const result = await query(
      `INSERT INTO app_settings (key, value) VALUES ($1, $2::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = $2::jsonb RETURNING *`,
      [key, JSON.stringify(value)]
    );
    await logActivity(req.user.name, 'UPDATE_SETTINGS', 'SETTINGS', null, `Mengubah pengaturan: ${key}`);
    res.json(result.rows[0]);
  } catch (err) {
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  }
});

// ============================================================
// DYNAMIC CATEGORIES API
// ============================================================
router.get('/categories', optionalAuth, async (req, res) => {
  try {
    const result = await query(`SELECT * FROM categories ORDER BY domain ASC, name ASC`);
    res.json(result.rows);
  } catch (err) {
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  }
});

// Admin, IT, or GA can create categories
router.post('/categories', authenticate, requireRole('admin', 'it', 'ga'), async (req, res) => {
  const { domain, code, name, tag_prefix, icon = 'fa-box' } = req.body;
  if (!domain || !code || !name || !tag_prefix) {
    return sendError(res, 400, 'Domain, kode, nama, dan prefix tag wajib diisi.', 'VALIDATION_ERROR');
  }
  if (!['IT', 'GA'].includes(domain)) {
    return sendError(res, 422, 'Domain harus berupa "IT" atau "GA".', 'INVALID_DOMAIN');
  }

  try {
    const cleanCode = code.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const result = await query(
      `INSERT INTO categories (domain, code, name, tag_prefix, icon)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [domain, cleanCode, name.trim(), tag_prefix.toUpperCase().trim(), icon]
    );
    await logActivity(req.user.name, 'CREATE_CATEGORY', 'SETTINGS', result.rows[0].id, `Menambah kategori: [${domain}] ${name}`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return sendError(res, 409, `Kode kategori "${code}" sudah terdaftar.`, 'CONFLICT');
    }
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  }
});

// Admin only can delete categories
router.delete('/categories/:id', authenticate, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  try {
    const cat = await query(`SELECT name FROM categories WHERE id = $1`, [id]);
    if (cat.rows.length === 0) {
      return sendError(res, 404, 'Kategori tidak ditemukan.', 'NOT_FOUND');
    }
    await query(`DELETE FROM categories WHERE id = $1`, [id]);
    await logActivity(req.user.name, 'DELETE_CATEGORY', 'SETTINGS', id, `Menghapus kategori: ${cat.rows[0]?.name || id}`);
    res.json({ message: 'Kategori berhasil dihapus' });
  } catch (err) {
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  }
});

export default router;
