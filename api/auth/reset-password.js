import pg from 'pg';
import crypto from 'crypto';
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

  const { token, newPassword } = req.body || {};
  if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password required' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();

    const userRow = await client.query(
      'SELECT id, email, reset_token_expires FROM users WHERE reset_token = $1',
      [token]
    );
    if (userRow.rows.length === 0) {
      await client.end();
      return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });
    }

    const user = userRow.rows[0];
    const expires = Number(user.reset_token_expires);
    if (!expires || Date.now() > expires) {
      await client.end();
      return res.status(400).json({ error: 'This reset link has expired. Please request a new one.' });
    }

    const salt = crypto.randomBytes(32).toString('hex');
    const hash = await hashPassword(newPassword, salt);

    await client.query(
      `UPDATE users
         SET password_hash = $1,
             salt = $2,
             reset_token = NULL,
             reset_token_expires = NULL,
             updated_at = NOW()
       WHERE id = $3`,
      [hash, salt, user.id]
    );

    await client.end();
    return res.status(200).json({ success: true, email: user.email });
  } catch (err) {
    try { await client.end(); } catch {}
    return res.status(500).json({ error: 'Reset failed: ' + err.message });
  }
}
