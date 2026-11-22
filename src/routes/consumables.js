import { Router } from 'express';
import { pool, query } from '../db.js';
import { logActivity } from '../utils/logger.js';
import { sendError } from '../utils/errorResponse.js';

const router = Router();

// ============================================================
// 1. CONSUMABLES LIST
// ============================================================
router.get('/', async (req, res) => {
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
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  }
});

// ============================================================
// 2. CREATE SINGLE CONSUMABLE MASTER
// ============================================================
router.post('/', async (req, res) => {
  const { name, category, current_stock = 0, min_stock_alert = 5, unit = 'pcs', userName } = req.body;
  if (!name || !name.trim()) {
    return sendError(res, 400, 'Nama barang wajib diisi.', 'VALIDATION_ERROR');
  }

  try {
    const result = await query(
      `INSERT INTO consumables (name, category, current_stock, min_stock_alert, unit)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name.trim(), category || 'atk', parseInt(current_stock, 10) || 0, parseInt(min_stock_alert, 10) || 5, unit || 'pcs']
    );
    await logActivity(userName || 'Admin', 'CREATE_CONSUMABLE', 'CONSUMABLE', result.rows[0].id, `Menambah item consumable: ${name}`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  }
});

// ============================================================
// 3. BATCH OPERATIONS FOR CONSUMABLES (MULTI-LINE)
// ============================================================

// Batch Master Consumables (Multi-line Input Master Baru)
router.post('/batch-create', async (req, res) => {
  const { items = [], userName } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return sendError(res, 400, 'Daftar barang tidak boleh kosong', 'VALIDATION_ERROR');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const created = [];
    for (const it of items) {
      if (!it.name || !it.name.trim()) continue;
      const result = await client.query(
        `INSERT INTO consumables (name, category, unit, current_stock, min_stock_alert)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [it.name.trim(), it.category || 'atk', it.unit || 'pcs', parseInt(it.current_stock, 10) || 0, parseInt(it.min_stock_alert, 10) || 5]
      );
      created.push(result.rows[0]);
    }
    await client.query('COMMIT');
    await logActivity(userName || 'Admin', 'BATCH_CREATE_CONSUMABLE', 'CONSUMABLE', null, `Menambahkan ${created.length} master barang ATK baru`);
    res.status(201).json({ message: `${created.length} master barang ATK berhasil disimpan`, count: created.length, items: created });
  } catch (err) {
    await client.query('ROLLBACK');
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  } finally {
    client.release();
  }
});

// Batch Restock (Penerimaan Stok Multi-line dari Nota)
router.post('/batch-restock', async (req, res) => {
  const { items = [], notes, userName } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return sendError(res, 400, 'Daftar item restock tidak boleh kosong', 'VALIDATION_ERROR');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const restocked = [];
    for (const it of items) {
      const cid = parseInt(it.consumable_id, 10);
      const qty = parseInt(it.quantity, 10);
      if (!cid || !qty || qty <= 0) continue;

      const upd = await client.query(
        `UPDATE consumables SET current_stock = current_stock + $1 WHERE id = $2 RETURNING name, current_stock`,
        [qty, cid]
      );
      if (upd.rows.length > 0) {
        restocked.push({ id: cid, name: upd.rows[0].name, added: qty, new_stock: upd.rows[0].current_stock });
      }
    }
    await client.query('COMMIT');
    await logActivity(userName || 'Admin', 'BATCH_RESTOCK_CONSUMABLE', 'CONSUMABLE', null, `Restock ${restocked.length} item ATK. ${notes ? `Catatan: ${notes}` : ''}`);
    res.json({ message: `Restock ${restocked.length} barang berhasil dicatat`, count: restocked.length, items: restocked });
  } catch (err) {
    await client.query('ROLLBACK');
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  } finally {
    client.release();
  }
});

// Batch Checkout (Pengeluaran Stok Multi-line / Bon Permintaan)
router.post('/batch-checkout', async (req, res) => {
  const { items = [], recipient_name, notes, userName } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return sendError(res, 400, 'Daftar barang keluar tidak boleh kosong', 'VALIDATION_ERROR');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // 1. Validasi kecukupan stok semua item terlebih dahulu dengan row lock FOR UPDATE
    for (const it of items) {
      const cid = parseInt(it.consumable_id, 10);
      const qty = parseInt(it.quantity, 10);
      if (!cid || !qty || qty <= 0) continue;

      const cur = await client.query('SELECT name, current_stock, unit FROM consumables WHERE id = $1 FOR UPDATE', [cid]);
      if (cur.rows.length === 0) {
        await client.query('ROLLBACK');
        return sendError(res, 404, `Barang ID ${cid} tidak ditemukan`, 'NOT_FOUND');
      }
      const itemData = cur.rows[0];
      if (itemData.current_stock < qty) {
        await client.query('ROLLBACK');
        return sendError(res, 400, `Stok "${itemData.name}" tidak cukup (Sisa: ${itemData.current_stock} ${itemData.unit}, Diminta: ${qty})`, 'INSUFFICIENT_STOCK');
      }
    }

    // 2. Eksekusi pengurangan stok & pencatatan log checkout
    const checkedOut = [];
    for (const it of items) {
      const cid = parseInt(it.consumable_id, 10);
      const qty = parseInt(it.quantity, 10);
      if (!cid || !qty || qty <= 0) continue;

      const upd = await client.query(
        `UPDATE consumables SET current_stock = current_stock - $1 WHERE id = $2 RETURNING name, current_stock, unit`,
        [qty, cid]
      );
      await client.query(
        `INSERT INTO consumable_checkouts (consumable_id, recipient_name, quantity, notes)
         VALUES ($1, $2, $3, $4)`,
        [cid, recipient_name || 'Karyawan', qty, notes || null]
      );
      checkedOut.push({ id: cid, name: upd.rows[0].name, quantity: qty, remaining: upd.rows[0].current_stock });
    }

    await client.query('COMMIT');
    await logActivity(userName || 'Admin', 'BATCH_CHECKOUT_CONSUMABLE', 'CONSUMABLE', null, `Pengeluaran ${checkedOut.length} jenis ATK untuk ${recipient_name || 'Karyawan'}`);
    res.json({ message: `Pengeluaran ${checkedOut.length} jenis barang berhasil dicatat`, count: checkedOut.length, items: checkedOut });
  } catch (err) {
    await client.query('ROLLBACK');
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  } finally {
    client.release();
  }
});

// ============================================================
// 4. SINGLE CONSUMABLE CHECKOUT & RESTOCK (TRANSACTION SAFE)
// ============================================================

// Single Checkout with Atomic Row Lock
router.post('/:id/checkout', async (req, res) => {
  const { id } = req.params;
  const { recipient_name, quantity = 1, notes, userName } = req.body;
  const qty = parseInt(quantity, 10);

  if (!recipient_name || !recipient_name.trim() || isNaN(qty) || qty <= 0) {
    return sendError(res, 400, 'Nama penerima dan jumlah wajib valid.', 'VALIDATION_ERROR');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const check = await client.query(`SELECT id, current_stock, name, unit FROM consumables WHERE id = $1 FOR UPDATE`, [id]);
    if (check.rows.length === 0) {
      await client.query('ROLLBACK');
      return sendError(res, 404, 'Barang tidak ditemukan', 'NOT_FOUND');
    }

    const item = check.rows[0];
    if (item.current_stock < qty) {
      await client.query('ROLLBACK');
      return sendError(res, 400, `Stok tidak cukup. Sisa stok: ${item.current_stock} ${item.unit}`, 'INSUFFICIENT_STOCK');
    }

    const upd = await client.query(
      `UPDATE consumables SET current_stock = current_stock - $1 WHERE id = $2 RETURNING current_stock`,
      [qty, id]
    );

    await client.query(
      `INSERT INTO consumable_checkouts (consumable_id, recipient_name, quantity, notes)
       VALUES ($1, $2, $3, $4)`,
      [id, recipient_name.trim(), qty, notes || null]
    );

    await client.query(
      `INSERT INTO activity_logs (user_name, action, target_type, target_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [userName || 'Admin', 'STOCK_OUT', 'CONSUMABLE', id, `Mengeluarkan ${qty} ${item.name} ke ${recipient_name.trim()}`]
    );

    await client.query('COMMIT');
    res.status(201).json({ message: 'Pengeluaran dicatat', new_stock: upd.rows[0].current_stock });
  } catch (err) {
    await client.query('ROLLBACK');
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  } finally {
    client.release();
  }
});

// Single Restock
router.post('/:id/restock', async (req, res) => {
  const { id } = req.params;
  const { quantity = 1, userName } = req.body;
  const qty = parseInt(quantity, 10);

  if (isNaN(qty) || qty <= 0) {
    return sendError(res, 400, 'Jumlah restock harus lebih dari 0.', 'VALIDATION_ERROR');
  }

  try {
    const result = await query(
      `UPDATE consumables SET current_stock = current_stock + $1 WHERE id = $2 RETURNING *`,
      [qty, id]
    );
    if (result.rows.length === 0) {
      return sendError(res, 404, 'Barang tidak ditemukan.', 'NOT_FOUND');
    }
    await logActivity(userName || 'Admin', 'RESTOCK', 'CONSUMABLE', id, `Restock ${qty} unit barang: ${result.rows[0]?.name}`);
    res.json({ message: 'Stok berhasil ditambah', consumable: result.rows[0] });
  } catch (err) {
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  }
});

export default router;
