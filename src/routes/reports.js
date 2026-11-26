import { Router } from 'express';
import { query } from '../db.js';
import { sendError } from '../utils/errorResponse.js';

const router = Router();

function sanitizeCsvCell(val) {
  if (val === null || val === undefined) return '""';
  let str = String(val);
  // Prevent CSV Formula Injection
  if (/^[=\+\-@\t\r]/.test(str)) {
    str = "'" + str;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

function resolveMonthParam(rawMonth) {
  return /^\d{4}-\d{2}$/.test(rawMonth || '') ? rawMonth : new Date().toISOString().slice(0, 7);
}

async function fetchMonthlyConsumables(monthParam, category = '', includeTransactions = false) {
  const startDate = `${monthParam}-01`;
  const params = category ? [startDate, category] : [startDate];
  const catFilter = category ? `AND c.category = $2` : '';

  const itemsQuery = query(`
    SELECT c.id, c.name, c.category, c.unit, c.current_stock, c.min_stock_alert,
      (c.current_stock <= c.min_stock_alert) as is_low_stock,
      COALESCE((
        SELECT SUM(cr.quantity) FROM consumable_restocks cr
        WHERE cr.consumable_id = c.id
          AND cr.restock_date >= $1::date
          AND cr.restock_date < ($1::date + INTERVAL '1 month')
      ), 0)::int as total_in_month,
      COALESCE((
        SELECT SUM(cc.quantity) FROM consumable_checkouts cc
        WHERE cc.consumable_id = c.id
          AND cc.checkout_date >= $1::date
          AND cc.checkout_date < ($1::date + INTERVAL '1 month')
      ), 0)::int as total_out_month,
      COALESCE((
        SELECT COUNT(*) FROM consumable_checkouts cc
        WHERE cc.consumable_id = c.id
          AND cc.checkout_date >= $1::date
          AND cc.checkout_date < ($1::date + INTERVAL '1 month')
      ), 0)::int as checkout_tx_count
    FROM consumables c
    WHERE 1=1 ${catFilter}
    ORDER BY total_out_month DESC, c.name ASC
  `, params);

  if (!includeTransactions) {
    const itemsRes = await itemsQuery;
    return { items: itemsRes.rows, transactions: [] };
  }

  const txQuery = query(`
    SELECT cc.id, cc.consumable_id, cc.recipient_name, cc.quantity, cc.notes, cc.checkout_date,
           c.name as item_name, c.category, c.unit
    FROM consumable_checkouts cc
    JOIN consumables c ON cc.consumable_id = c.id
    WHERE cc.checkout_date >= $1::date
      AND cc.checkout_date < ($1::date + INTERVAL '1 month')
      ${catFilter}
    ORDER BY cc.checkout_date DESC, cc.id DESC
  `, params);

  const [itemsRes, txRes] = await Promise.all([itemsQuery, txQuery]);
  return { items: itemsRes.rows, transactions: txRes.rows };
}

router.get('/export', async (req, res) => {
  const { type = 'assets' } = req.query;
  try {
    const filename = `export-${type}-${new Date().toISOString().split('T')[0]}.csv`;
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
        csvContent += [
          sanitizeCsvCell(r.code),
          sanitizeCsvCell(r.name),
          sanitizeCsvCell(r.category),
          sanitizeCsvCell(r.subcategory),
          sanitizeCsvCell(r.serial_number || '-'),
          sanitizeCsvCell(r.status),
          sanitizeCsvCell(r.location),
          sanitizeCsvCell(r.pemegang || 'Gudang'),
          sanitizeCsvCell(r.created_at)
        ].join(',') + '\n';
      });
    } else if (type === 'consumables') {
      const result = await query(`SELECT * FROM consumables ORDER BY name ASC`);
      csvContent = 'Nama Barang,Kategori,Sisa Stok,Satuan,Batas Alert Kritis\n';
      result.rows.forEach(r => {
        csvContent += [
          sanitizeCsvCell(r.name),
          sanitizeCsvCell(r.category),
          sanitizeCsvCell(r.current_stock),
          sanitizeCsvCell(r.unit),
          sanitizeCsvCell(r.min_stock_alert)
        ].join(',') + '\n';
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
        csvContent += [
          sanitizeCsvCell(r.checkout_date),
          sanitizeCsvCell(r.item_name),
          sanitizeCsvCell(r.quantity),
          sanitizeCsvCell(r.recipient_name),
          sanitizeCsvCell(r.notes || '-')
        ].join(',') + '\n';
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
        csvContent += [
          sanitizeCsvCell(r.ticket_no),
          sanitizeCsvCell(r.title),
          sanitizeCsvCell(r.category),
          sanitizeCsvCell(r.priority),
          sanitizeCsvCell(r.status),
          sanitizeCsvCell(r.requester_name || '-'),
          sanitizeCsvCell(r.asset_code || '-'),
          sanitizeCsvCell(r.created_at),
          sanitizeCsvCell(r.resolution_note || '-')
        ].join(',') + '\n';
      });
    } else if (type === 'consumables-monthly') {
      const monthParam = resolveMonthParam(req.query.month);
      const { items } = await fetchMonthlyConsumables(monthParam, req.query.category || '', false);

      csvContent = `Laporan Bulanan ATK / Tinta / Ribbon - Periode ${monthParam}\n`;
      csvContent += 'Nama Barang,Kategori,Satuan,Masuk Bulan Ini,Keluar Bulan Ini,Stok Akhir,Batas Min,Status\n';
      items.forEach(r => {
        const status = r.is_low_stock ? 'KRITIS / RESTOCK' : 'AMAN';
        csvContent += [
          sanitizeCsvCell(r.name),
          sanitizeCsvCell(r.category),
          sanitizeCsvCell(r.unit),
          sanitizeCsvCell(r.total_in_month),
          sanitizeCsvCell(r.total_out_month),
          sanitizeCsvCell(r.current_stock),
          sanitizeCsvCell(r.min_stock_alert),
          sanitizeCsvCell(status)
        ].join(',') + '\n';
      });
    } else if (type === 'maintenances') {
      const monthParam = req.query.month && /^\d{4}-\d{2}$/.test(req.query.month) ? req.query.month : '';
      const params = monthParam ? [`${monthParam}-01`] : [];
      const monthWhere = monthParam
        ? `WHERE m.maintenance_date >= $1::date AND m.maintenance_date < ($1::date + INTERVAL '1 month')`
        : '';
      const result = await query(`
        SELECT m.maintenance_date, a.code as asset_code, a.name as asset_name,
               COALESCE(l.name, a.location) as asset_location,
               m.type, COALESCE(m.executor_type, 'internal') as executor_type,
               m.vendor, m.performed_by, m.cost, m.notes
        FROM asset_maintenances m
        JOIN assets a ON m.asset_id = a.id
        LEFT JOIN locations l ON a.location_id = l.id
        ${monthWhere}
        ORDER BY m.maintenance_date DESC, m.id DESC
      `, params);

      csvContent = `Laporan Maintenance Aset${monthParam ? ` - Periode ${monthParam}` : ''}\n`;
      csvContent += 'Tanggal,Kode Aset,Nama Aset,Lokasi,Jenis Pekerjaan,Pelaksana,Vendor/Teknisi,PIC Pencatat,Biaya (Rp),Catatan\n';
      result.rows.forEach(r => {
        csvContent += [
          sanitizeCsvCell(r.maintenance_date ? new Date(r.maintenance_date).toISOString().slice(0, 10) : '-'),
          sanitizeCsvCell(r.asset_code),
          sanitizeCsvCell(r.asset_name),
          sanitizeCsvCell(r.asset_location),
          sanitizeCsvCell(r.type),
          sanitizeCsvCell(r.executor_type),
          sanitizeCsvCell(r.vendor || '-'),
          sanitizeCsvCell(r.performed_by || '-'),
          sanitizeCsvCell(r.cost || 0),
          sanitizeCsvCell(r.notes || '-')
        ].join(',') + '\n';
      });
    } else {
      return sendError(res, 400, `Tipe ekspor "${type}" tidak valid.`, 'INVALID_EXPORT_TYPE');
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (err) {
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  }
});

// Laporan Bulanan Pemakaian & Stok ATK / Tinta / Ribbon
router.get('/consumables-monthly', async (req, res) => {
  const monthParam = resolveMonthParam(req.query.month);
  const category = req.query.category || '';

  try {
    const { items, transactions } = await fetchMonthlyConsumables(monthParam, category, true);
    const summary = {
      total_items: items.length,
      total_in: items.reduce((acc, r) => acc + (r.total_in_month || 0), 0),
      total_out: items.reduce((acc, r) => acc + (r.total_out_month || 0), 0),
      low_stock_count: items.filter(r => r.is_low_stock).length
    };

    res.json({
      month: monthParam,
      category: category || 'all',
      summary,
      items,
      transactions
    });
  } catch (err) {
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  }
});

export default router;
