import { sendError } from '../utils/errorResponse.js';

const failedLoginAttempts = new Map(); // ip -> { count, firstAttempt }

/**
 * Clean up expired rate limit entries periodically (every 10 minutes)
 */
setInterval(() => {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  for (const [ip, record] of failedLoginAttempts.entries()) {
    if (now - record.firstAttempt > windowMs) {
      failedLoginAttempts.delete(ip);
    }
  }
}, 10 * 60 * 1000).unref();

/**
 * Middleware: Rate limiter for login endpoint to block automated brute-force attacks
 * Max 5 failed attempts per 15 minutes per IP address.
 */
export function loginRateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxAttempts = 5;

  const record = failedLoginAttempts.get(ip);
  if (record && (now - record.firstAttempt) <= windowMs && record.count >= maxAttempts) {
    const waitSeconds = Math.ceil((record.firstAttempt + windowMs - now) / 1000);
    res.setHeader('Retry-After', waitSeconds);
    return sendError(
      res,
      429,
      `Terlalu banyak percobaan login gagal. Demi keamanan, akun dibatasi selama ${Math.ceil(waitSeconds / 60)} menit lagi.`,
      'RATE_LIMIT_EXCEEDED',
      { retryAfterSeconds: waitSeconds }
    );
  }

  next();
}

/**
 * Helper to register a failed login attempt for an IP
 */
export function recordFailedLogin(ip) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  let record = failedLoginAttempts.get(ip);

  if (!record || (now - record.firstAttempt) > windowMs) {
    failedLoginAttempts.set(ip, { count: 1, firstAttempt: now });
  } else {
    record.count++;
  }
}

/**
 * Helper to clear failed login attempts upon successful login
 */
export function recordSuccessfulLogin(ip) {
  failedLoginAttempts.delete(ip);
}
