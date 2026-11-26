import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  console.warn('[Security Warning] JWT_SECRET is not set; using ephemeral per-process secret. Set JWT_SECRET in production.');
  return crypto.randomBytes(32).toString('hex');
})();

/**
 * Hash password using salted scrypt algorithm
 */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

/**
 * Verify password supporting both modern salted scrypt and legacy SHA-256
 */
export function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== 'string') return false;

  if (storedHash.startsWith('scrypt:')) {
    const parts = storedHash.split(':');
    if (parts.length !== 3) return false;
    const salt = parts[1];
    const originalHash = parts[2];
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    const hashBuf = Buffer.from(hash, 'hex');
    const origBuf = Buffer.from(originalHash, 'hex');
    if (hashBuf.length !== origBuf.length) return false;
    return crypto.timingSafeEqual(hashBuf, origBuf);
  }

  // Legacy SHA-256 fallback (constant time comparison)
  const sha256 = crypto.createHash('sha256').update(password).digest('hex');
  const shaBuf = Buffer.from(sha256);
  const storedBuf = Buffer.from(storedHash);
  if (shaBuf.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(shaBuf, storedBuf);
}

/**
 * Generate HMAC-SHA256 authenticated token (24-hour expiration)
 */
export function generateAuthToken(user) {
  const payload = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    exp: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(payloadB64).digest('base64url');
  return `${payloadB64}.${signature}`;
}

/**
 * Verify and decode HMAC-SHA256 authenticated token
 */
export function verifyAuthToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, signature] = parts;
  const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(payloadB64).digest('base64url');

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}
