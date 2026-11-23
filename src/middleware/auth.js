import { verifyAuthToken } from '../utils/auth.js';
import { sendError } from '../utils/errorResponse.js';

/**
 * Middleware: Verify Bearer Token and attach authenticated user to req.user
 */
export function authenticate(req, res, next) {
  let token = null;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.query && req.query.token) {
    // For direct binary/CSV download links
    token = req.query.token;
  }

  if (!token) {
    return sendError(res, 401, 'Sesi login tidak ditemukan. Silakan login terlebih dahulu.', 'UNAUTHORIZED');
  }

  const payload = verifyAuthToken(token);
  if (!payload) {
    return sendError(res, 401, 'Sesi login telah kedaluwarsa atau tidak valid. Silakan login kembali.', 'INVALID_TOKEN');
  }

  req.user = payload;
  next();
}

/**
 * Middleware: Optional Authentication (attaches req.user if token present, otherwise req.user = null)
 */
export function optionalAuth(req, res, next) {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (token) {
    req.user = verifyAuthToken(token);
  } else {
    req.user = null;
  }
  next();
}

/**
 * Middleware: Restrict access based on user role (RBAC)
 * Admin role always has full bypass access.
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, 401, 'Autentikasi diperlukan.', 'UNAUTHORIZED');
    }

    // Admin has superuser privileges across all modules
    if (req.user.role === 'admin') {
      return next();
    }

    if (allowedRoles.includes(req.user.role)) {
      return next();
    }

    return sendError(
      res,
      403,
      `Akses ditolak. Tindakan ini memerlukan hak akses [${allowedRoles.join('/')}].`,
      'FORBIDDEN'
    );
  };
}
