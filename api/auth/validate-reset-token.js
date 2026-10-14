import pg from 'pg';
const { Client } = pg;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });

  const { token } = req.body || {};
  if (!token) return res.status(400).json({ valid: false, reason: 'missing' });

  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
    const row = await client.query(
      'SELECT email, reset_token_expires FROM users WHERE reset_token = $1',
      [token]
    );
    await client.end();

    if (row.rows.length === 0) {
      return res.status(200).json({ valid: false, reason: 'invalid' });
    }

    const expires = Number(row.rows[0].reset_token_expires);
    if (!expires || Date.now() > expires) {
      return res.status(200).json({ valid: false, reason: 'expired' });
    }

    return res.status(200).json({ valid: true, email: row.rows[0].email });
  } catch (err) {
    try { await client.end(); } catch {}
    return res.status(500).json({ valid: false, reason: 'server_error', error: err.message });
  }
}
