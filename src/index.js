import express from 'express';
import cors from 'cors';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { pool, query } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Hash password using native SHA-256
const hashPassword = (password) => crypto.createHash('sha256').update(password).digest('hex');

// Audit Trail Logger Helper
async function logActivity(userName, action, targetType, targetId, details) {
  try {
    await query(
      `INSERT INTO activity_logs (user_name, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5)`,
      [userName || 'System', action, targetType, targetId || null, details]
    );
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
}

// ============================================================
// 1. AUTHENTICATION API
// ============================================================
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email dan password wajib diisi.' });
  }

  try {
    const hashed = hashPassword(password);
    const result = await query(
      `SELECT id, name, email, role, is_active FROM users WHERE LOWER(email) = LOWER($1) AND password_hash = $2`,
      [email.trim(), hashed]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Email atau password salah.' });
    }

    const user = result.rows[0];
    if (!user.is_active) {
      return res.status(403).json({ error: 'Akun Anda dinonaktifkan. Hubungi Administrator.' });
    }

    await logActivity(user.name, 'LOGIN', 'USER', user.id, `User ${user.name} (${user.role}) berhasil login`);
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 2. APP SETTINGS & BRANDING API
// ============================================================
app.get('/api/settings', async (req, res) => {
  try {
    const result = await query(`SELECT key, value FROM app_settings`);
    const settings = {};
    result.rows.forEach(r => { settings[r.key] = r.value; });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/settings', async (req, res) => {
  const { key, value, userName } = req.body;
  if (!key || !value) return res.status(400).json({ error: 'Key dan value wajib diisi.' });

  try {
    const result = await query(
      `INSERT INTO app_settings (key, value) VALUES ($1, $2::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = $2::jsonb RETURNING *`,
      [key, JSON.stringify(value)]
    );
    await logActivity(userName || 'Admin', 'UPDATE_SETTINGS', 'SETTINGS', null, `Mengubah pengaturan: ${key}`);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 3. DYNAMIC CATEGORIES API
// ============================================================
app.get('/api/categories', async (req, res) => {
  try {
    const result = await query(`SELECT * FROM categories ORDER BY domain ASC, name ASC`);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/categories', async (req, res) => {
  const { domain, code, name, tag_prefix, icon = 'fa-box', userName } = req.body;
  try {
    const cleanCode = code.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const result = await query(
      `INSERT INTO categories (domain, code, name, tag_prefix, icon)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [domain, cleanCode, name, tag_prefix.toUpperCase(), icon]
    );
    await logActivity(userName || 'Admin', 'CREATE_CATEGORY', 'SETTINGS', result.rows[0].id, `Menambah kategori: [${domain}] ${name}`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/categories/:id', async (req, res) => {
  const { id } = req.params;
  const { userName } = req.query;
  try {
    const cat = await query(`SELECT name FROM categories WHERE id = $1`, [id]);
    await query(`DELETE FROM categories WHERE id = $1`, [id]);
    await logActivity(userName || 'Admin', 'DELETE_CATEGORY', 'SETTINGS', id, `Menghapus kategori: ${cat.rows[0]?.name || id}`);
    res.json({ message: 'Kategori berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 4. USERS & PERMISSION MANAGEMENT API
// ============================================================
app.get('/api/users', async (req, res) => {
  try {
    const result = await query(`SELECT id, name, email, role, is_active, created_at FROM users ORDER BY id ASC`);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', async (req, res) => {
  const { name, email, password = 'password123', role = 'employee', is_active = true, userName } = req.body;
  try {
    const hashed = hashPassword(password);
    const result = await query(
      `INSERT INTO users (name, email, password_hash, role, is_active)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, role, is_active, created_at`,
      [name, email.toLowerCase().trim(), hashed, role, is_active]
    );
    await logActivity(userName || 'Admin', 'CREATE_USER', 'USER', result.rows[0].id, `Menambah pengguna: ${name} (${role})`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  const { name, email, role, is_active, password, userName } = req.body;
  try {
    let q = `UPDATE users SET name = COALESCE($1, name), email = COALESCE($2, email), role = COALESCE($3, role), is_active = COALESCE($4, is_active)`;
    const params = [name, email ? email.toLowerCase().trim() : null, role, is_active];

    if (password && password.trim().length > 0) {
      params.push(hashPassword(password));
      q += `, password_hash = $${params.length}`;
    }

    params.push(id);
    q += ` WHERE id = $${params.length} RETURNING id, name, email, role, is_active`;

    const result = await query(q, params);
    await logActivity(userName || 'Admin', 'UPDATE_USER', 'USER', id, `Mengubah data user: ${result.rows[0]?.name}`);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  const { userName } = req.query;
  try {
    await query(`DELETE FROM users WHERE id = $1`, [id]);
    await logActivity(userName || 'Admin', 'DELETE_USER', 'USER', id, `Menghapus user ID: ${id}`);
    res.json({ message: 'User berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 5. OVERVIEW STATS API
// ============================================================
app.get('/api/stats', async (req, res) => {
  try {
    const [assetsStat, accessoriesStat, consumablesStat, ticketsStat] = await Promise.all([
      query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN category = 'IT' THEN 1 ELSE 0 END) as it_total,
          SUM(CASE WHEN category = 'GA' THEN 1 ELSE 0 END) as ga_total,
          SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) as available,
          SUM(CASE WHEN status = 'assigned' THEN 1 ELSE 0 END) as assigned
        FROM assets
      `),
      query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN linked_asset_id IS NOT NULL THEN 1 ELSE 0 END) as linked,
          SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) as available
        FROM accessories
      `),
      query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN current_stock <= min_stock_alert THEN 1 ELSE 0 END) as low_stock_count
        FROM consumables
      `),
      query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_count,
          SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_count,
          SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved_count
        FROM tickets
      `),
    ]);

    res.json({
      assets: assetsStat.rows[0],
      accessories: accessoriesStat.rows[0],
      consumables: consumablesStat.rows[0],
      tickets: ticketsStat.rows[0],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 6. ASSETS & HISTORY API
// ============================================================
app.get('/api/assets', async (req, res) => {
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
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/assets', async (req, res) => {
  const { code, name, category, subcategory, serial_number, status = 'available', location = 'Head Office', specs = {}, assigned_to_user_id, userName } = req.body;
  try {
    let finalCode = code;
    if (!finalCode) {
      const prefix = category === 'IT' ? (subcategory === 'laptop' ? 'IT-LPT' : 'IT-AST') : 'GA-AST';
      finalCode = `${prefix}-${Date.now().toString().slice(-4)}`;
    }

    const result = await query(
      `INSERT INTO assets (code, name, category, subcategory, serial_number, status, location, specs, assigned_to_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [finalCode, name, category, subcategory, serial_number || null, status, location, JSON.stringify(specs), assigned_to_user_id || null]
    );

    const newAsset = result.rows[0];

    // If assigned to a user right at creation, log handover
    if (assigned_to_user_id) {
      const bastNo = `BAST/${new Date().getFullYear()}/${Date.now().toString().slice(-4)}`;
      await query(
        `INSERT INTO asset_user_history (asset_id, to_user_id, action_type, condition, bast_number, notes)
         VALUES ($1, $2, 'checkout', 'Baik (Aset Baru)', $3, 'Penyerahan awal saat registrasi aset')`,
        [newAsset.id, assigned_to_user_id, bastNo]
      );
    }

    await logActivity(userName || 'Admin', 'CREATE_ASSET', 'ASSET', newAsset.id, `Mendaftarkan aset baru: [${newAsset.code}] ${newAsset.name}`);
    res.status(201).json(newAsset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// BATCH OPERATIONS FOR ASSETS
// ============================================================

// Batch Mutasi / Serah Terima (Combined BAST)
app.post('/api/assets/batch-handover', async (req, res) => {
  const { asset_ids = [], to_user_id, action_type = 'checkout', condition = 'Baik (Normal)', notes, userName } = req.body;
  if (!Array.isArray(asset_ids) || asset_ids.length === 0) {
    return res.status(400).json({ error: 'Daftar aset tidak boleh kosong' });
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
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Batch Ubah Status Aset
app.patch('/api/assets/batch-status', async (req, res) => {
  const { asset_ids = [], status, notes, userName } = req.body;
  if (!Array.isArray(asset_ids) || asset_ids.length === 0) {
    return res.status(400).json({ error: 'Daftar aset tidak boleh kosong' });
  }
  if (!status) {
    return res.status(400).json({ error: 'Status tujuan harus ditentukan' });
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
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Batch Hapus Aset
app.post('/api/assets/batch-delete', async (req, res) => {
  const { asset_ids = [], userName } = req.body;
  if (!Array.isArray(asset_ids) || asset_ids.length === 0) {
    return res.status(400).json({ error: 'Daftar aset tidak boleh kosong' });
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
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Serah Terima Aset (Handover / Mutasi Pemegang)
app.post('/api/assets/:id/handover', async (req, res) => {
  const { id } = req.params;
  const { to_user_id, action_type = 'checkout', condition = 'Baik (Normal)', notes, userName } = req.body;

  try {
    // 1. Ambil data aset saat ini
    const current = await query(`SELECT code, name, assigned_to_user_id FROM assets WHERE id = $1`, [id]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Aset tidak ditemukan' });

    const asset = current.rows[0];
    const from_user_id = asset.assigned_to_user_id;
    const newStatus = action_type === 'checkin' ? 'available' : 'assigned';
    const targetUserId = action_type === 'checkin' ? null : (to_user_id ? parseInt(to_user_id, 10) : null);
    const bastNo = `BAST/${new Date().getFullYear()}/${Date.now().toString().slice(-5)}`;

    // 2. Update status aset & assigned user
    await query(
      `UPDATE assets SET assigned_to_user_id = $1, status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
      [targetUserId, newStatus, id]
    );

    // 3. Catat di asset_user_history
    const historyResult = await query(
      `INSERT INTO asset_user_history (asset_id, from_user_id, to_user_id, action_type, condition, bast_number, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [id, from_user_id, targetUserId, action_type, condition, bastNo, notes || null]
    );

    // 4. Log Activity
    const actionDesc = action_type === 'checkin' ? 'Pengembalian aset ke gudang' : `Serah terima aset ke user ID: ${targetUserId}`;
    await logActivity(userName || 'Admin', 'HANDOVER_ASSET', 'ASSET', id, `[${asset.code}] ${actionDesc} (${bastNo})`);

    res.json({
      message: 'Mutasi serah terima aset berhasil dicatat',
      bast_number: bastNo,
      history: historyResult.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Timeline Lengkap Aset (Handover, Maintenance, Changes)
app.get('/api/assets/:id/history', async (req, res) => {
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
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/assets/:id', async (req, res) => {
  const { id } = req.params;
  const { userName } = req.query;
  try {
    const asset = await query(`SELECT code, name FROM assets WHERE id = $1`, [id]);
    await query(`DELETE FROM assets WHERE id = $1`, [id]);
    await logActivity(userName || 'Admin', 'DELETE_ASSET', 'ASSET', id, `Menghapus aset: ${asset.rows[0]?.code}`);
    res.json({ message: 'Aset berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Riwayat Maintenance
app.get('/api/assets/:id/maintenances', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await query(`SELECT * FROM asset_maintenances WHERE asset_id = $1 ORDER BY maintenance_date DESC`, [id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/assets/:id/maintenances', async (req, res) => {
  const { id } = req.params;
  const { maintenance_date = new Date(), type, cost = 0, vendor, notes, userName } = req.body;
  try {
    const result = await query(
      `INSERT INTO asset_maintenances (asset_id, maintenance_date, type, cost, vendor, notes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id, maintenance_date, type, cost, vendor || null, notes || null]
    );
    await logActivity(userName || 'Admin', 'MAINTENANCE_LOG', 'ASSET', id, `Mencatat servis [${type}] biaya Rp ${cost}`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 7. ACCESSORIES API
// ============================================================
app.get('/api/accessories', async (req, res) => {
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
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/accessories', async (req, res) => {
  const { name, category, serial_number, status = 'available', linked_asset_id, assigned_to_user_id, userName } = req.body;
  try {
    const result = await query(
      `INSERT INTO accessories (name, category, serial_number, status, linked_asset_id, assigned_to_user_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, category, serial_number || null, status, linked_asset_id || null, assigned_to_user_id || null]
    );
    await logActivity(userName || 'Admin', 'CREATE_ACCESSORY', 'ACCESSORY', result.rows[0].id, `Menambah aksesoris: ${name}`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/accessories/:id', async (req, res) => {
  const { id } = req.params;
  const { userName } = req.query;
  try {
    await query(`DELETE FROM accessories WHERE id = $1`, [id]);
    await logActivity(userName || 'Admin', 'DELETE_ACCESSORY', 'ACCESSORY', id, `Menghapus aksesoris ID: ${id}`);
    res.json({ message: 'Aksesoris berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 8. CONSUMABLES & CHECKOUT API
// ============================================================
app.get('/api/consumables', async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        c.*,
        (c.current_stock <= c.min_stock_alert) as is_low_stock,
        (SELECT COUNT(*) FROM consumable_checkouts cc WHERE cc.consumable_id = c.id) as checkout_count
      FROM consumables c
      ORDER BY is_low_stock DESC, c.name ASC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/consumables', async (req, res) => {
  const { name, category, current_stock = 0, min_stock_alert = 5, unit = 'pcs', userName } = req.body;
  try {
    const result = await query(
      `INSERT INTO consumables (name, category, current_stock, min_stock_alert, unit)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, category, parseInt(current_stock, 10), parseInt(min_stock_alert, 10), unit]
    );
    await logActivity(userName || 'Admin', 'CREATE_CONSUMABLE', 'CONSUMABLE', result.rows[0].id, `Menambah item consumable: ${name}`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/consumables/:id/checkout', async (req, res) => {
  const { id } = req.params;
  const { recipient_name, quantity = 1, notes, userName } = req.body;
  const qty = parseInt(quantity, 10);

  if (!recipient_name || qty <= 0) return res.status(400).json({ error: 'Nama penerima dan jumlah wajib valid.' });

  try {
    const check = await query(`SELECT current_stock, name FROM consumables WHERE id = $1`, [id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Barang tidak ditemukan' });

    const item = check.rows[0];
    if (item.current_stock < qty) {
      return res.status(400).json({ error: `Stok tidak cukup. Sisa stok: ${item.current_stock}` });
    }

    await query(`UPDATE consumables SET current_stock = current_stock - $1 WHERE id = $2`, [qty, id]);

    const log = await query(
      `INSERT INTO consumable_checkouts (consumable_id, recipient_name, quantity, notes)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [id, recipient_name, qty, notes || null]
    );

    await logActivity(userName || 'Admin', 'STOCK_OUT', 'CONSUMABLE', id, `Mengeluarkan ${qty} ${item.name} ke ${recipient_name}`);
    res.status(201).json({ message: 'Pengeluaran dicatat', new_stock: item.current_stock - qty });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/consumables/:id/restock', async (req, res) => {
  const { id } = req.params;
  const { quantity = 1, userName } = req.body;
  const qty = parseInt(quantity, 10);

  try {
    const result = await query(
      `UPDATE consumables SET current_stock = current_stock + $1 WHERE id = $2 RETURNING *`,
      [qty, id]
    );
    await logActivity(userName || 'Admin', 'RESTOCK', 'CONSUMABLE', id, `Restock ${qty} unit barang: ${result.rows[0]?.name}`);
    res.json({ message: 'Stok berhasil ditambah', consumable: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 9. TICKETS / LOGBOOK API
// ============================================================
app.get('/api/tickets', async (req, res) => {
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
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tickets', async (req, res) => {
  const { title, description, category, priority = 'medium', requester_id, related_asset_id, userName } = req.body;
  const ticket_no = `LOG-${Date.now().toString().slice(-4)}`;
  try {
    const result = await query(
      `INSERT INTO tickets (ticket_no, title, description, category, priority, status, requester_id, related_asset_id)
       VALUES ($1, $2, $3, $4, $5, 'open', $6, $7) RETURNING *`,
      [ticket_no, title, description || null, category, priority, requester_id || null, related_asset_id || null]
    );
    await logActivity(userName || 'User', 'CREATE_TICKET', 'TICKET', result.rows[0].id, `Membuat tiket logbook: [${ticket_no}] ${title}`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/tickets/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status, resolution_note, userName } = req.body;
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
    await logActivity(userName || 'Admin', 'UPDATE_TICKET', 'TICKET', id, `Mengubah status tiket menjadi ${status}`);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/tickets/:id', async (req, res) => {
  const { id } = req.params;
  const { userName } = req.query;
  try {
    await query(`DELETE FROM tickets WHERE id = $1`, [id]);
    await logActivity(userName || 'Admin', 'DELETE_TICKET', 'TICKET', id, `Menghapus tiket ID: ${id}`);
    res.json({ message: 'Tiket berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 10. AUDIT TRAIL / ACTIVITY LOGS API
// ============================================================
app.get('/api/activity-logs', async (req, res) => {
  try {
    const result = await query(`SELECT * FROM activity_logs ORDER BY id DESC LIMIT 100`);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 11. EXPORT REPORTS API (CSV Format for Excel)
// ============================================================
app.get('/api/reports/export', async (req, res) => {
  const { type = 'assets' } = req.query;
  try {
    let filename = `export-${type}-${new Date().toISOString().split('T')[0]}.csv`;
    let csvContent = '';

    if (type === 'assets') {
      const result = await query(`
        SELECT a.code, a.name, a.category, a.subcategory, a.serial_number, a.status, a.location,
               u.name as pemegang, a.created_at
        FROM assets a
        LEFT JOIN users u ON a.assigned_to_user_id = u.id
        ORDER BY a.id ASC
      `);
      csvContent = 'Kode Tag,Nama Aset,Domain,Kategori,Serial Number,Status,Lokasi,Pemegang,Tanggal Registrasi\n';
      result.rows.forEach(r => {
        csvContent += `"${r.code}","${r.name}","${r.category}","${r.subcategory}","${r.serial_number || '-'}","${r.status}","${r.location}","${r.pemegang || 'Gudang'}","${r.created_at}"\n`;
      });
    } else if (type === 'consumables') {
      const result = await query(`SELECT * FROM consumables ORDER BY name ASC`);
      csvContent = 'Nama Barang,Kategori,Sisa Stok,Satuan,Batas Alert Kritis\n';
      result.rows.forEach(r => {
        csvContent += `"${r.name}","${r.category}","${r.current_stock}","${r.unit}","${r.min_stock_alert}"\n`;
      });
    } else if (type === 'checkouts') {
      const result = await query(`
        SELECT cc.*, c.name as item_name
        FROM consumable_checkouts cc
        JOIN consumables c ON cc.consumable_id = c.id
        ORDER BY cc.id DESC
      `);
      csvContent = 'Tanggal,Nama Barang,Jumlah,Penerima,Keperluan\n';
      result.rows.forEach(r => {
        csvContent += `"${r.checkout_date}","${r.item_name}","${r.quantity}","${r.recipient_name}","${r.notes || '-'}"\n`;
      });
    } else if (type === 'tickets') {
      const result = await query(`
        SELECT t.*, u.name as requester_name, a.code as asset_code
        FROM tickets t
        LEFT JOIN users u ON t.requester_id = u.id
        LEFT JOIN assets a ON t.related_asset_id = a.id
        ORDER BY t.id DESC
      `);
      csvContent = 'No Tiket,Judul,Kategori,Prioritas,Status,Pemohon,Terkait Aset,Tanggal,Solusi\n';
      result.rows.forEach(r => {
        csvContent += `"${r.ticket_no}","${r.title}","${r.category}","${r.priority}","${r.status}","${r.requester_name || '-'}","${r.asset_code || '-'}","${r.created_at}","${r.resolution_note || '-'}"\n`;
      });
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`GA & IT Management Core V2 running on port ${PORT}`);
});
