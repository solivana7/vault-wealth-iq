// Create a Stripe Billing Portal session for the logged-in user.
// Returns { url } — frontend does window.location = url
// User can then update card, cancel subscription, view invoices, etc.
import Stripe from 'stripe';
import pg from 'pg';

const { Client } = pg;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
  apiVersion: '2024-12-18.acacia',
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST required' });
  }

  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required' });

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Stripe not configured' });
  }

  const dbClient = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await dbClient.connect();
    const userRow = await dbClient.query(
      'SELECT id, stripe_customer_id FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );
    await dbClient.end();

    if (userRow.rows.length === 0) {
      return res.status(404).json({ error: 'No account found.' });
    }

    const customerId = userRow.rows[0].stripe_customer_id;
    if (!customerId) {
      return res.status(400).json({
        error: 'No Stripe customer record yet. Subscribe first to manage billing.',
      });
    }

    const origin =
      req.headers.origin ||
      'https://' + (req.headers.host || process.env.CLIENT_ORIGIN || 'vaultwealthiq.com');

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    try { await dbClient.end(); } catch {}
    console.error('Billing portal error:', err);
    return res.status(500).json({ error: 'Could not open billing portal: ' + err.message });
  }
}
