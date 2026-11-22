import { Router } from 'express';
import { query } from '../db.js';
import { hashPassword } from '../utils/auth.js';
import { logActivity } from '../utils/logger.js';
import { sendError } from '../utils/errorResponse.js';

const router = Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return sendError(res, 400, 'Email dan password wajib diisi.', 'VALIDATION_ERROR');
  }

  try {
    const hashed = hashPassword(password);
    const result = await query(
      `SELECT id, name, email, role, is_active FROM users WHERE LOWER(email) = LOWER($1) AND password_hash = $2`,
      [email.trim(), hashed]
    );

    if (result.rows.length === 0) {
      return sendError(res, 401, 'Email atau password salah.', 'INVALID_CREDENTIALS');
    }

    const user = result.rows[0];
    if (!user.is_active) {
      return sendError(res, 403, 'Akun Anda dinonaktifkan. Hubungi Administrator.', 'ACCOUNT_DISABLED');
    }

    await logActivity(user.name, 'LOGIN', 'USER', user.id, `User ${user.name} (${user.role}) berhasil login`);
    res.json({ user });
  } catch (err) {
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  }
});

export default router;
