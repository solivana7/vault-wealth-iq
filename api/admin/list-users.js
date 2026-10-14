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

  const { adminEmail, adminPassword } = req.body || {};
  if (!adminEmail || !adminPassword) {
    return res.status(400).json({ error: 'adminEmail and adminPassword required' });
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();

    const adminRow = await client.query(
      'SELECT password_hash, salt, is_admin FROM users WHERE email = $1',
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

    const users = await client.query(
      `SELECT id, email, name, paid, plan, is_admin, trial_start, created_at
       FROM users ORDER BY created_at DESC LIMIT 500`
    );

    await client.end();

    return res.status(200).json({
      success: true,
      users: users.rows.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        paid: u.paid,
        plan: u.plan,
        isAdmin: u.is_admin,
        trialStart: Number(u.trial_start),
        createdAt: u.created_at,
      })),
    });
  } catch (err) {
    try { await client.end(); } catch {}
    return res.status(500).json({ error: 'List users failed: ' + err.message });
  }
}
