import pg from 'pg';
import crypto from 'crypto';
import { validateToken } from '../../lib/csrf.js';
const { Client } = pg;

function hashPassword(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err);
      else resolve(key.toString('hex'));
    });
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });

  const { email, name, password } = req.body || {};
  if (!email || !name || !password) return res.status(400).json({ error: 'Email, name, and password are required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  
  // CSRF validation
  const csrfToken = req.body.csrfToken;
  const csrfCheck = validateToken(csrfToken);
  if (!csrfCheck.valid) {
    return res.status(403).json({ error: 'Invalid or expired security token. Please refresh the page and try again.' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();

    const existing = await client.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existing.rows.length > 0) {
      await client.end();
      return res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
    }

    const salt = crypto.randomBytes(32).toString('hex');
    const hash = await hashPassword(password, salt);

    const result = await client.query(
      'INSERT INTO users (email, name, password_hash, salt, trial_start) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, name, trial_start, paid, plan',
      [normalizedEmail, name.trim(), hash, salt, Date.now()]
    );
    await client.end();

    const user = result.rows[0];
    return res.status(201).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        trialStart: Number(user.trial_start),
        paid: user.paid,
        plan: user.plan,
        isAdmin: false,
      },
    });
  } catch (err) {
    try { await client.end(); } catch {}
    return res.status(500).json({ error: 'Registration failed: ' + err.message });
  }
}
