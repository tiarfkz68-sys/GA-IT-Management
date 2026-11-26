import { pool } from '../db.js';
import { logActivity } from './logger.js';
import { sendError } from './errorResponse.js';

/**
 * Execute a transactional batch import across master tables with consistent
 * validation, duplicate handling, activity logging, and response formatting.
 */
export async function runBatchImport(res, {
  items,
  emptyError = 'Data untuk diimpor tidak boleh kosong.',
  maxItems = 500,
  entityLabel,
  userName = 'Admin',
  logAction,
  logTargetType,
  onSuccess,
  processItem
}) {
  if (!Array.isArray(items) || items.length === 0) {
    return sendError(res, 400, emptyError, 'VALIDATION_ERROR');
  }
  if (items.length > maxItems) {
    return sendError(res, 400, `Maksimal ${maxItems} baris per proses import.`, 'VALIDATION_ERROR');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const imported = [];
    const updated = [];
    const skipped = [];

    for (const item of items) {
      await processItem(client, item, { imported, updated, skipped });
    }

    await client.query('COMMIT');
    if (onSuccess) onSuccess();

    await logActivity(
      userName,
      logAction,
      logTargetType,
      null,
      `Import ${imported.length} ${entityLabel} baru, update ${updated.length}, lewati ${skipped.length}`
    );

    res.json({
      message: `Impor ${entityLabel} selesai: ${imported.length} baru${updated.length ? `, ${updated.length} diperbarui` : ''}${skipped.length ? `, ${skipped.length} dilewati` : ''}`,
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
}
