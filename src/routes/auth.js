import { Router } from 'express';
import { query } from '../db.js';
import { hashPassword, verifyPassword, generateAuthToken } from '../utils/auth.js';
import { logActivity } from '../utils/logger.js';
import { sendError } from '../utils/errorResponse.js';
import { loginRateLimiter, recordFailedLogin, recordSuccessfulLogin } from '../middleware/rateLimiter.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.post('/login', loginRateLimiter, async (req, res) => {
  const { email, password } = req.body;
  const ip = req.ip || req.connection.remoteAddress || 'unknown';

  if (!email || !password) {
    return sendError(res, 400, 'Email dan password wajib diisi.', 'VALIDATION_ERROR');
  }

  try {
    const result = await query(
      `SELECT id, name, email, role, is_active, password_hash FROM users WHERE LOWER(email) = LOWER($1)`,
      [email.trim()]
    );

    if (result.rows.length === 0) {
      recordFailedLogin(ip);
      return sendError(res, 401, 'Email atau password salah.', 'INVALID_CREDENTIALS');
    }

    const user = result.rows[0];

    const isValid = verifyPassword(password, user.password_hash);
    if (!isValid) {
      recordFailedLogin(ip);
      return sendError(res, 401, 'Email atau password salah.', 'INVALID_CREDENTIALS');
    }

    if (!user.is_active) {
      return sendError(res, 403, 'Akun Anda dinonaktifkan. Hubungi Administrator.', 'ACCOUNT_DISABLED');
    }

    // Success - reset failed login counter for this IP
    recordSuccessfulLogin(ip);

    // Progressive migration: upgrade legacy SHA-256 hash to salted scrypt
    if (!user.password_hash.startsWith('scrypt:')) {
      try {
        const upgradedHash = hashPassword(password);
        await query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [upgradedHash, user.id]);
        console.log(`[Security] Upgraded user password hash to salted scrypt for: ${user.email}`);
      } catch (errUpgrade) {
        console.error('Failed to upgrade password hash:', errUpgrade.message);
      }
    }

    // Generate signed HMAC token
    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      is_active: user.is_active
    };
    const token = generateAuthToken(safeUser);

    await logActivity(user.name, 'LOGIN', 'USER', user.id, `User ${user.name} (${user.role}) berhasil login`);
    res.json({ user: safeUser, token });
  } catch (err) {
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  }
});

// Verify current session token
router.get('/me', authenticate, async (req, res) => {
  res.json({ user: req.user });
});

export default router;
