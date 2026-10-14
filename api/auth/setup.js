import pg from 'pg';
const { Client } = pg;

export default async function handler(req, res) {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        trial_start BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000),
        paid BOOLEAN NOT NULL DEFAULT false,
        plan TEXT DEFAULT NULL,
        is_admin BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token TEXT DEFAULT NULL`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires BIGINT DEFAULT NULL`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT DEFAULT NULL`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT DEFAULT NULL`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT NULL`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS current_period_end BIGINT DEFAULT NULL`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT false`);

    let bootstrapped = null;
    const ownerEmail = (process.env.OWNER_EMAIL || '').toLowerCase().trim();
    if (ownerEmail) {
      const upd = await client.query(
        `UPDATE users SET is_admin = true, paid = true, plan = COALESCE(plan, 'owner'), updated_at = NOW()
         WHERE email = $1 RETURNING email, is_admin, paid, plan`,
        [ownerEmail]
      );
      bootstrapped = upd.rows[0] || { email: ownerEmail, note: 'user not yet registered' };
    }

    const result = await client.query('SELECT COUNT(*) as ct FROM users');
    await client.end();
    return res.status(200).json({
      success: true,
      message: 'Users table ready',
      userCount: result.rows[0].ct,
      bootstrapped,
    });
  } catch (err) {
    try { await client.end(); } catch {}
    return res.status(500).json({ error: err.message });
  }
}
