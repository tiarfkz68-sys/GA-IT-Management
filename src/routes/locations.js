import { Router } from 'express';
import { query } from '../db.js';
import { logActivity } from '../utils/logger.js';
import { sendError } from '../utils/errorResponse.js';
import { authenticate, requireRole, optionalAuth } from '../middleware/auth.js';

const router = Router();

// In-memory cache for locations (60s TTL)
let locationsCache = null;
let locationsCacheExpires = 0;
const CACHE_TTL_MS = 60 * 1000;

export function invalidateLocationsCache() {
  locationsCache = null;
  locationsCacheExpires = 0;
}

// 1. List all locations
router.get('/', optionalAuth, async (req, res) => {
  try {
    const now = Date.now();
    if (locationsCache && now < locationsCacheExpires) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(locationsCache);
    }

    const result = await query(`
      SELECT l.*, 
        (SELECT COUNT(*) FROM assets a WHERE a.location_id = l.id) as asset_count
      FROM locations l 
      ORDER BY l.name ASC
    `);

    locationsCache = result.rows;
    locationsCacheExpires = now + CACHE_TTL_MS;
    res.setHeader('X-Cache', 'MISS');
    res.json(result.rows);
  } catch (err) {
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  }
});

// 2. Create location (Admin, GA, IT)
router.post('/', authenticate, requireRole('admin', 'ga', 'it'), async (req, res) => {
  const { name, building_floor, description } = req.body;
  if (!name || !name.trim()) {
    return sendError(res, 400, 'Nama lokasi wajib diisi.', 'VALIDATION_ERROR');
  }

  try {
    const result = await query(
      `INSERT INTO locations (name, building_floor, description) 
       VALUES ($1, $2, $3) RETURNING *`,
      [name.trim(), building_floor?.trim() || null, description?.trim() || null]
    );
    invalidateLocationsCache();
    await logActivity(req.user?.name || 'Admin', 'CREATE_LOCATION', 'SETTINGS', result.rows[0].id, `Menambah lokasi: ${name}`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return sendError(res, 409, `Lokasi "${name}" sudah terdaftar.`, 'CONFLICT');
    }
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  }
});

// 3. Update location
router.put('/:id', authenticate, requireRole('admin', 'ga', 'it'), async (req, res) => {
  const { id } = req.params;
  const { name, building_floor, description } = req.body;
  if (!name || !name.trim()) {
    return sendError(res, 400, 'Nama lokasi wajib diisi.', 'VALIDATION_ERROR');
  }

  try {
    const result = await query(
      `UPDATE locations 
       SET name = $1, building_floor = $2, description = $3 
       WHERE id = $4 RETURNING *`,
      [name.trim(), building_floor?.trim() || null, description?.trim() || null, id]
    );
    if (result.rows.length === 0) {
      return sendError(res, 404, 'Lokasi tidak ditemukan.', 'NOT_FOUND');
    }
    invalidateLocationsCache();
    await logActivity(req.user?.name || 'Admin', 'UPDATE_LOCATION', 'SETTINGS', id, `Mengubah lokasi: ${name}`);
    res.json(result.rows[0]);
  } catch (err) {
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  }
});

// 4. Delete location (Admin only)
router.delete('/:id', authenticate, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  try {
    // Check if any assets currently reference this location
    const assetCheck = await query(`SELECT COUNT(*) as count FROM assets WHERE location_id = $1`, [id]);
    if (parseInt(assetCheck.rows[0].count, 10) > 0) {
      return sendError(res, 400, `Lokasi tidak dapat dihapus karena masih digunakan oleh ${assetCheck.rows[0].count} aset.`, 'LOCATION_IN_USE');
    }

    const loc = await query(`SELECT name FROM locations WHERE id = $1`, [id]);
    if (loc.rows.length === 0) {
      return sendError(res, 404, 'Lokasi tidak ditemukan.', 'NOT_FOUND');
    }
    await query(`DELETE FROM locations WHERE id = $1`, [id]);
    invalidateLocationsCache();
    await logActivity(req.user?.name || 'Admin', 'DELETE_LOCATION', 'SETTINGS', id, `Menghapus lokasi: ${loc.rows[0]?.name}`);
    res.json({ message: 'Lokasi berhasil dihapus' });
  } catch (err) {
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  }
});

export default router;
