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

export default router;
