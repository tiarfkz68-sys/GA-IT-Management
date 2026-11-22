import { query } from '../db.js';

export async function logActivity(userName, action, targetType, targetId, details) {
  try {
    await query(
      `INSERT INTO activity_logs (user_name, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5)`,
      [userName || 'System', action, targetType, targetId || null, details]
    );
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
}
