import { Router } from 'express';
import { pool, query } from '../db.js';
import { logActivity } from '../utils/logger.js';
import { sendError } from '../utils/errorResponse.js';
import { authenticate, requireRole, optionalAuth } from '../middleware/auth.js';

const router = Router();

// ============================================================
// IN-MEMORY CACHE FOR HIGH-FREQUENCY READS (TTL 60s + EVENT INVALIDATION)
// ============================================================
let settingsCache = null;
let settingsCacheExpires = 0;
let categoriesCache = null;
let categoriesCacheExpires = 0;
const CACHE_TTL_MS = 60 * 1000;

export function invalidateSettingsCache() {
  settingsCache = null;
  settingsCacheExpires = 0;
}

export function invalidateCategoriesCache() {
  categoriesCache = null;
  categoriesCacheExpires = 0;
}

// ============================================================
// APP SETTINGS & BRANDING API
// ============================================================
router.get('/settings', optionalAuth, async (req, res) => {
  try {
    const now = Date.now();
    if (settingsCache && now < settingsCacheExpires) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(settingsCache);
    }

    const result = await query(`SELECT key, value FROM app_settings`);
    const settings = {};
    result.rows.forEach(r => { settings[r.key] = r.value; });

    settingsCache = settings;
    settingsCacheExpires = now + CACHE_TTL_MS;
    res.setHeader('X-Cache', 'MISS');
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
    invalidateSettingsCache();
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
    const now = Date.now();
    if (categoriesCache && now < categoriesCacheExpires) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(categoriesCache);
    }

    const result = await query(`SELECT * FROM categories ORDER BY domain ASC, name ASC`);
    categoriesCache = result.rows;
    categoriesCacheExpires = now + CACHE_TTL_MS;
    res.setHeader('X-Cache', 'MISS');
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
    invalidateCategoriesCache();
    await logActivity(req.user.name, 'CREATE_CATEGORY', 'SETTINGS', result.rows[0].id, `Menambah kategori: [${domain}] ${name}`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return sendError(res, 409, `Kode kategori "${code}" sudah terdaftar.`, 'CONFLICT');
    }
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  }
});

// Admin, IT, or GA can batch import categories
router.post('/categories/batch-import', authenticate, requireRole('admin', 'it', 'ga'), async (req, res) => {
  const { items = [], overwriteExisting = false } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return sendError(res, 400, 'Data kategori untuk diimpor tidak boleh kosong.', 'VALIDATION_ERROR');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const imported = [];
    const updated = [];
    const skipped = [];

    for (const item of items) {
      const domain = String(item.domain || 'IT').toUpperCase().trim();
      const rawCode = String(item.code || '').trim();
      const name = String(item.name || '').trim();
      const tagPrefix = String(item.tag_prefix || '').toUpperCase().trim();
      const icon = String(item.icon || 'fa-box').trim();

      if (!name || !rawCode || !tagPrefix || !['IT', 'GA'].includes(domain)) {
        skipped.push({ code: rawCode || '-', name: name || '-', reason: 'Data tidak lengkap atau domain bukan IT/GA' });
        continue;
      }

      const cleanCode = rawCode.toLowerCase().replace(/[^a-z0-9_]/g, '_');
      const exist = await client.query(`SELECT id FROM categories WHERE LOWER(code) = LOWER($1)`, [cleanCode]);

      if (exist.rows.length > 0) {
        if (!overwriteExisting) {
          skipped.push({ code: cleanCode, name, reason: 'Kode kategori sudah terdaftar' });
          continue;
        }
        await client.query(
          `UPDATE categories SET domain = $1, name = $2, tag_prefix = $3, icon = $4 WHERE id = $5`,
          [domain, name, tagPrefix, icon, exist.rows[0].id]
        );
        updated.push(cleanCode);
      } else {
        const ins = await client.query(
          `INSERT INTO categories (domain, code, name, tag_prefix, icon) VALUES ($1, $2, $3, $4, $5) RETURNING id, code, name`,
          [domain, cleanCode, name, tagPrefix, icon]
        );
        imported.push(ins.rows[0]);
      }
    }

    await client.query('COMMIT');
    invalidateCategoriesCache();
    await logActivity(req.user?.name || 'Admin', 'IMPORT_CATEGORIES', 'SETTINGS', null, `Import ${imported.length} kategori baru, update ${updated.length}, lewati ${skipped.length}`);

    res.json({
      message: `Impor kategori selesai: ${imported.length} baru${updated.length ? `, ${updated.length} diperbarui` : ''}${skipped.length ? `, ${skipped.length} dilewati` : ''}`,
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

// Admin only can delete categories
router.delete('/categories/:id', authenticate, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  try {
    const cat = await query(`SELECT name FROM categories WHERE id = $1`, [id]);
    if (cat.rows.length === 0) {
      return sendError(res, 404, 'Kategori tidak ditemukan.', 'NOT_FOUND');
    }
    await query(`DELETE FROM categories WHERE id = $1`, [id]);
    invalidateCategoriesCache();
    await logActivity(req.user.name, 'DELETE_CATEGORY', 'SETTINGS', id, `Menghapus kategori: ${cat.rows[0]?.name || id}`);
    res.json({ message: 'Kategori berhasil dihapus' });
  } catch (err) {
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  }
});

export default router;
