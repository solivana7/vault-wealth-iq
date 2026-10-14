// CSRF Protection Utilities
import crypto from 'crypto';

const CSRF_SECRET = process.env.CSRF_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

export function generateToken() {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(16).toString('hex');
  const data = `${timestamp}:${random}`;
  const hmac = crypto.createHmac('sha256', CSRF_SECRET);
  hmac.update(data);
  const signature = hmac.digest('hex').slice(0, 16);
  return `${data}:${signature}`;
}

export function validateToken(token) {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Token missing' };
  }
  
  const parts = token.split(':');
  if (parts.length !== 3) {
    return { valid: false, error: 'Invalid token format' };
  }
  
  const [timestamp, random, signature] = parts;
  const data = `${timestamp}:${random}`;
  
  const hmac = crypto.createHmac('sha256', CSRF_SECRET);
  hmac.update(data);
  const expectedSignature = hmac.digest('hex').slice(0, 16);
  
  if (signature !== expectedSignature) {
    return { valid: false, error: 'Invalid signature' };
  }
  
  const tokenTime = parseInt(timestamp, 36);
  if (Date.now() - tokenTime > TOKEN_EXPIRY) {
    return { valid: false, error: 'Token expired' };
  }
  
  return { valid: true };
}
