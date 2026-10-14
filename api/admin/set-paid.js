// Admin-only: toggle a user's paid status / bypass trial.
// Used to comp accounts, bypass the 14-day wait, or revoke access.
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

  const { adminEmail, adminPassword, targetEmail, paid } = req.body || {};
  if (!adminEmail || !adminPassword || !targetEmail || typeof paid !== 'boolean') {
    return res
      .status(400)
      .json({ error: 'adminEmail, adminPassword, targetEmail, paid (boolean) required' });
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();

    const adminRow = await client.query(
      'SELECT id, password_hash, salt, is_admin FROM users WHERE email = $1',
      [adminEmail.toLowerCase().trim()]
    );
    if (adminRow.rows.length === 0) {
      await client.end();
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const admin = adminRow.rows[0];
    const hash = await hashPassword(adminPassword, admin.salt);
    if (hash !== admin.password_hash) {
      await client.end();
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (!admin.is_admin) {
      await client.end();
      return res.status(403).json({ error: 'Caller is not an admin' });
    }

    const target = targetEmail.toLowerCase().trim();
    const upd = await client.query(
      `UPDATE users
         SET paid = $1,
             plan = CASE WHEN $1 THEN COALESCE(plan, 'comped') ELSE plan END,
             updated_at = NOW()
       WHERE email = $2
       RETURNING id, email, name, paid, plan, is_admin`,
      [paid, target]
    );

    await client.end();

    if (upd.rows.length === 0) {
      return res.status(404).json({ error: 'Target user not found' });
    }

    return res.status(200).json({ success: true, user: upd.rows[0] });
  } catch (err) {
    try { await client.end(); } catch {}
    return res.status(500).json({ error: 'Update failed: ' + err.message });
  }
}
