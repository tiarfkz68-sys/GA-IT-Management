import { Router } from 'express';
import { pool, query } from '../db.js';
import { logActivity } from '../utils/logger.js';
import { sendError } from '../utils/errorResponse.js';
import { authenticate, requireRole, optionalAuth } from '../middleware/auth.js';

const router = Router();

// ============================================================
// 1. ASSET LIST & SEARCH
// ============================================================
router.get('/', async (req, res) => {
  const { category, subcategory, status, search } = req.query;
  try {
    let q = `
      SELECT 
        a.*, 
        u.name as assigned_to_name,
        COALESCE(
          (SELECT json_agg(json_build_object('id', acc.id, 'name', acc.name, 'category', acc.category))
           FROM accessories acc 
           WHERE acc.linked_asset_id = a.id), 
          '[]'::json
        ) as linked_accessories,
        (SELECT COUNT(*) FROM asset_maintenances m WHERE m.asset_id = a.id) as maintenance_count,
        (SELECT COUNT(*) FROM asset_user_history h WHERE h.asset_id = a.id) as handover_count
      FROM assets a
      LEFT JOIN users u ON a.assigned_to_user_id = u.id
      WHERE 1=1
    `;
    const params = [];
    if (category) {
      params.push(category);
      q += ` AND a.category = $${params.length}`;
    }
    if (subcategory) {
      params.push(subcategory);
      q += ` AND a.subcategory = $${params.length}`;
    }
    if (status) {
      params.push(status);
      q += ` AND a.status = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      q += ` AND (a.name ILIKE $${params.length} OR a.code ILIKE $${params.length} OR a.serial_number ILIKE $${params.length})`;
    }
    q += ` ORDER BY a.id DESC`;

    const result = await query(q, params);
    res.json(result.rows);
  } catch (err) {
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  }
});

// ============================================================
// 2. CREATE NEW ASSET
// ============================================================
router.post('/', async (req, res) => {
  const { code, name, category, subcategory, serial_number, status = 'available', location = 'Head Office', specs = {}, assigned_to_user_id, userName } = req.body;

  // Boundary Validation
  if (!name || !name.trim()) {
    return sendError(res, 400, 'Nama barang wajib diisi.', 'VALIDATION_ERROR');
  }
  if (!category || !['IT', 'GA'].includes(category)) {
    return sendError(res, 422, 'Kategori divisi harus "IT" atau "GA".', 'INVALID_CATEGORY');
  }

  let finalCode = code ? code.trim() : '';
  if (!finalCode) {
    const prefix = category === 'IT' ? (subcategory === 'laptop' ? 'IT-LPT' : 'IT-AST') : 'GA-AST';
    finalCode = `${prefix}-${Date.now().toString().slice(-4)}`;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO assets (code, name, category, subcategory, serial_number, status, location, specs, assigned_to_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [finalCode, name.trim(), category, subcategory || 'other', serial_number || null, status, location, JSON.stringify(specs || {}), assigned_to_user_id || null]
    );

    const newAsset = result.rows[0];

    // If assigned to a user right at creation, log initial handover in history
    if (assigned_to_user_id) {
      const bastNo = `BAST/${new Date().getFullYear()}/${Date.now().toString().slice(-4)}`;
      await client.query(
        `INSERT INTO asset_user_history (asset_id, to_user_id, action_type, condition, bast_number, notes)
         VALUES ($1, $2, 'checkout', 'Baik (Aset Baru)', $3, 'Penyerahan awal saat registrasi aset')`,
        [newAsset.id, assigned_to_user_id, bastNo]
      );
    }

    await client.query('COMMIT');
    await logActivity(userName || 'Admin', 'CREATE_ASSET', 'ASSET', newAsset.id, `Mendaftarkan aset baru: [${newAsset.code}] ${newAsset.name}`);
    res.status(201).json(newAsset);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return sendError(res, 409, `Kode aset "${finalCode}" sudah terdaftar.`, 'CONFLICT');
    }
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  } finally {
    client.release();
  }
});

// ============================================================
// 3. BATCH OPERATIONS
// ============================================================

// Batch Mutasi / Serah Terima (Combined BAST)
router.post('/batch-handover', async (req, res) => {
  const { asset_ids = [], to_user_id, action_type = 'checkout', condition = 'Baik (Normal)', notes, userName } = req.body;
  if (!Array.isArray(asset_ids) || asset_ids.length === 0) {
    return sendError(res, 400, 'Daftar aset tidak boleh kosong', 'VALIDATION_ERROR');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const bastNo = `BAST/${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, '0')}/BATCH-${Date.now().toString().slice(-4)}`;
    const newStatus = action_type === 'checkin' ? 'available' : 'assigned';
    const targetUserId = action_type === 'checkin' ? null : (to_user_id ? parseInt(to_user_id, 10) : null);

    const processed = [];
    for (const id of asset_ids) {
      const cur = await client.query('SELECT id, code, name, assigned_to_user_id FROM assets WHERE id = $1 FOR UPDATE', [id]);
      if (cur.rows.length === 0) continue;
      const asset = cur.rows[0];
      const from_user_id = asset.assigned_to_user_id;

      await client.query(
        'UPDATE assets SET assigned_to_user_id = $1, status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
        [targetUserId, newStatus, id]
      );

      await client.query(
        `INSERT INTO asset_user_history (asset_id, from_user_id, to_user_id, action_type, condition, bast_number, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, from_user_id, targetUserId, action_type, condition, bastNo, notes || null]
      );

      const actionDesc = action_type === 'checkin' ? 'Pengembalian massal ke gudang' : `Serah terima massal ke user ID: ${targetUserId}`;
      await client.query(
        `INSERT INTO activity_logs (user_name, action, target_type, target_id, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [userName || 'Admin', 'BATCH_HANDOVER', 'ASSET', id, `[${asset.code}] ${actionDesc} (${bastNo})`]
      );

      processed.push({ id: asset.id, code: asset.code, name: asset.name });
    }

    await client.query('COMMIT');
    res.json({
      message: `Mutasi massal ${processed.length} aset berhasil dicatat`,
      bast_number: bastNo,
      count: processed.length,
      assets: processed
    });
  } catch (err) {
    await client.query('ROLLBACK');
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  } finally {
    client.release();
  }
});

// Batch Ubah Status Aset
router.patch('/batch-status', async (req, res) => {
  const { asset_ids = [], status, notes, userName } = req.body;
  if (!Array.isArray(asset_ids) || asset_ids.length === 0) {
    return sendError(res, 400, 'Daftar aset tidak boleh kosong', 'VALIDATION_ERROR');
  }
  if (!status) {
    return sendError(res, 400, 'Status tujuan harus ditentukan', 'VALIDATION_ERROR');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updated = [];
    for (const id of asset_ids) {
      const cur = await client.query('SELECT id, code, name FROM assets WHERE id = $1 FOR UPDATE', [id]);
      if (cur.rows.length === 0) continue;
      const asset = cur.rows[0];

      await client.query(
        'UPDATE assets SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [status, id]
      );

      await client.query(
        `INSERT INTO activity_logs (user_name, action, target_type, target_id, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [userName || 'Admin', 'BATCH_UPDATE_STATUS', 'ASSET', id, `[${asset.code}] Mengubah status massal ke: ${status}. ${notes || ''}`]
      );
      updated.push(asset.code);
    }
    await client.query('COMMIT');
    res.json({ message: `Status ${updated.length} aset berhasil diubah ke ${status}`, count: updated.length, codes: updated });
  } catch (err) {
    await client.query('ROLLBACK');
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  } finally {
    client.release();
  }
});

// Batch Hapus Aset (Admin only)
router.post('/batch-delete', optionalAuth, async (req, res) => {
  if (req.user && req.user.role !== 'admin') {
    return sendError(res, 403, 'Hanya Administrator yang berwenang menghapus aset massal.', 'FORBIDDEN');
  }
  const { asset_ids = [], userName } = req.body;
  if (!Array.isArray(asset_ids) || asset_ids.length === 0) {
    return sendError(res, 400, 'Daftar aset tidak boleh kosong', 'VALIDATION_ERROR');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const deleted = [];
    for (const id of asset_ids) {
      const cur = await client.query('SELECT id, code FROM assets WHERE id = $1 FOR UPDATE', [id]);
      if (cur.rows.length === 0) continue;
      const asset = cur.rows[0];

      await client.query('DELETE FROM assets WHERE id = $1', [id]);
      await client.query(
        `INSERT INTO activity_logs (user_name, action, target_type, target_id, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [userName || 'Admin', 'BATCH_DELETE_ASSET', 'ASSET', id, `Menghapus massal aset: ${asset.code}`]
      );
      deleted.push(asset.code);
    }
    await client.query('COMMIT');
    res.json({ message: `${deleted.length} aset berhasil dihapus`, count: deleted.length, codes: deleted });
  } catch (err) {
    await client.query('ROLLBACK');
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  } finally {
    client.release();
  }
});

// Batch Import Aset (Excel / CSV)
router.post('/batch-import', async (req, res) => {
  const { assets = [], overwriteExisting = false, userName } = req.body;
  if (!Array.isArray(assets) || assets.length === 0) {
    return sendError(res, 400, 'Data aset untuk diimpor tidak boleh kosong', 'VALIDATION_ERROR');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const imported = [];
    const skipped = [];
    const updated = [];

    for (const item of assets) {
      if (!item.name || !item.name.trim()) continue;
      let finalCode = (item.code || '').trim();
      if (!finalCode) {
        const prefix = (item.category || 'IT').toUpperCase() === 'IT' ? 'IT-AST' : 'GA-AST';
        finalCode = `${prefix}-${Date.now().toString().slice(-4)}${Math.floor(Math.random() * 90 + 10)}`;
      }

      // Check existence
      const exist = await client.query('SELECT id, code FROM assets WHERE LOWER(code) = LOWER($1)', [finalCode]);
      if (exist.rows.length > 0) {
        if (!overwriteExisting) {
          skipped.push({ code: finalCode, name: item.name, reason: 'Kode aset sudah terdaftar' });
          continue;
        } else {
          const existingId = exist.rows[0].id;
          await client.query(
            `UPDATE assets SET name = $1, category = $2, subcategory = $3, serial_number = $4, status = $5, location = $6, specs = $7, updated_at = CURRENT_TIMESTAMP WHERE id = $8`,
            [
              item.name.trim(),
              item.category || 'IT',
              item.subcategory || 'other',
              item.serial_number || null,
              item.status || 'available',
              item.location || 'Head Office',
              JSON.stringify(item.specs || {}),
              existingId
            ]
          );
          updated.push(finalCode);
          continue;
        }
      }

      // Insert new
      const ins = await client.query(
        `INSERT INTO assets (code, name, category, subcategory, serial_number, status, location, specs, assigned_to_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, code, name`,
        [
          finalCode,
          item.name.trim(),
          item.category || 'IT',
          item.subcategory || 'other',
          item.serial_number || null,
          item.status || 'available',
          item.location || 'Head Office',
          JSON.stringify(item.specs || {}),
          item.assigned_to_user_id || null
        ]
      );
      imported.push(ins.rows[0]);
    }

    await client.query('COMMIT');
    await logActivity(
      userName || 'Admin',
      'IMPORT_EXCEL_ASSETS',
      'ASSET',
      null,
      `Import ${imported.length} aset baru${updated.length ? `, update ${updated.length} aset` : ''}${skipped.length ? `, lewati ${skipped.length} duplikasi` : ''}`
    );

    res.json({
      message: `Impor selesai: ${imported.length} baru${updated.length ? `, ${updated.length} diupdate` : ''}${skipped.length ? `, ${skipped.length} dilewati` : ''}`,
      total: assets.length,
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

// ============================================================
// 4. SINGLE ASSET OPERATIONS
// ============================================================

// Serah Terima Aset Tunggal (Handover / Mutasi Pemegang) - FULL TRANSACTION
router.post('/:id/handover', async (req, res) => {
  const { id } = req.params;
  const { to_user_id, action_type = 'checkout', condition = 'Baik (Normal)', notes, userName } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Ambil data aset dengan row lock FOR UPDATE
    const current = await client.query(`SELECT id, code, name, assigned_to_user_id FROM assets WHERE id = $1 FOR UPDATE`, [id]);
    if (current.rows.length === 0) {
      await client.query('ROLLBACK');
      return sendError(res, 404, 'Aset tidak ditemukan', 'NOT_FOUND');
    }

    const asset = current.rows[0];
    const from_user_id = asset.assigned_to_user_id;
    const newStatus = action_type === 'checkin' ? 'available' : 'assigned';
    const targetUserId = action_type === 'checkin' ? null : (to_user_id ? parseInt(to_user_id, 10) : null);
    const bastNo = `BAST/${new Date().getFullYear()}/${Date.now().toString().slice(-5)}`;

    // 2. Update status aset & assigned user
    await client.query(
      `UPDATE assets SET assigned_to_user_id = $1, status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
      [targetUserId, newStatus, id]
    );

    // 3. Catat di asset_user_history
    const historyResult = await client.query(
      `INSERT INTO asset_user_history (asset_id, from_user_id, to_user_id, action_type, condition, bast_number, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [id, from_user_id, targetUserId, action_type, condition, bastNo, notes || null]
    );

    // 4. Log Activity
    const actionDesc = action_type === 'checkin' ? 'Pengembalian aset ke gudang' : `Serah terima aset ke user ID: ${targetUserId}`;
    await client.query(
      `INSERT INTO activity_logs (user_name, action, target_type, target_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [userName || 'Admin', 'HANDOVER_ASSET', 'ASSET', id, `[${asset.code}] ${actionDesc} (${bastNo})`]
    );

    await client.query('COMMIT');
    res.json({
      message: 'Mutasi serah terima aset berhasil dicatat',
      bast_number: bastNo,
      history: historyResult.rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  } finally {
    client.release();
  }
});

// Timeline Lengkap Aset (Handover, Maintenance, Changes)
router.get('/:id/history', async (req, res) => {
  const { id } = req.params;
  try {
    const [handovers, maintenances, logs] = await Promise.all([
      query(`
        SELECT h.*, u_from.name as from_user_name, u_to.name as to_user_name
        FROM asset_user_history h
        LEFT JOIN users u_from ON h.from_user_id = u_from.id
        LEFT JOIN users u_to ON h.to_user_id = u_to.id
        WHERE h.asset_id = $1
        ORDER BY h.id DESC
      `, [id]),
      query(`SELECT * FROM asset_maintenances WHERE asset_id = $1 ORDER BY maintenance_date DESC, id DESC`, [id]),
      query(`SELECT * FROM activity_logs WHERE target_type = 'ASSET' AND target_id = $1 ORDER BY id DESC LIMIT 20`, [id])
    ]);

    res.json({
      handovers: handovers.rows,
      maintenances: maintenances.rows,
      logs: logs.rows
    });
  } catch (err) {
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  }
});

router.delete('/:id', optionalAuth, async (req, res) => {
  if (req.user && !['admin', 'it', 'ga'].includes(req.user.role)) {
    return sendError(res, 403, 'Akses ditolak. Anda tidak berwenang menghapus aset.', 'FORBIDDEN');
  }
  const { id } = req.params;
  const userName = req.user?.name || req.query.userName;
  try {
    const asset = await query(`SELECT code, name FROM assets WHERE id = $1`, [id]);
    if (asset.rows.length === 0) {
      return sendError(res, 404, 'Aset tidak ditemukan', 'NOT_FOUND');
    }
    await query(`DELETE FROM assets WHERE id = $1`, [id]);
    await logActivity(userName || 'Admin', 'DELETE_ASSET', 'ASSET', id, `Menghapus aset: ${asset.rows[0]?.code}`);
    res.json({ message: 'Aset berhasil dihapus' });
  } catch (err) {
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  }
});

// Riwayat Maintenance
router.get('/:id/maintenances', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await query(`SELECT * FROM asset_maintenances WHERE asset_id = $1 ORDER BY maintenance_date DESC`, [id]);
    res.json(result.rows);
  } catch (err) {
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  }
});

router.post('/:id/maintenances', async (req, res) => {
  const { id } = req.params;
  const { maintenance_date = new Date(), type, cost = 0, vendor, notes, userName } = req.body;
  if (!type) {
    return sendError(res, 400, 'Tipe servis / perbaikan wajib dipilih.', 'VALIDATION_ERROR');
  }

  try {
    const result = await query(
      `INSERT INTO asset_maintenances (asset_id, maintenance_date, type, cost, vendor, notes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id, maintenance_date, type, cost, vendor || null, notes || null]
    );
    await logActivity(userName || 'Admin', 'MAINTENANCE_LOG', 'ASSET', id, `Mencatat servis [${type}] biaya Rp ${cost}`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  }
});

export default router;
