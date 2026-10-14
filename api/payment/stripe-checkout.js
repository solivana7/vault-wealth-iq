// Create a Stripe Checkout Session for VAULT subscription (Monthly or Annual)
// Frontend POSTs { email, plan: 'monthly' | 'annual', csrfToken }
// Returns { url } — frontend does window.location = url
import Stripe from 'stripe';
import pg from 'pg';
import { validateToken } from '../../lib/csrf.js';

const { Client } = pg;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
  apiVersion: '2024-12-18.acacia',
});

const PRICE_IDS = {
  monthly: process.env.STRIPE_PRICE_VAULT_MONTHLY,
  annual: process.env.STRIPE_PRICE_VAULT_ANNUAL,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST required' });
  }

  const { email, plan, csrfToken } = req.body || {};

  const csrfCheck = validateToken(csrfToken);
  if (!csrfCheck.valid) {
    return res
      .status(403)
      .json({ error: 'Invalid or expired security token. Please refresh the page and try again.' });
  }

  if (!email || !plan) {
    return res.status(400).json({ error: 'email and plan are required' });
  }

  const priceId = PRICE_IDS[plan];
  if (!priceId) {
    return res.status(400).json({
      error: `Unknown plan "${plan}". Set STRIPE_PRICE_VAULT_MONTHLY and STRIPE_PRICE_VAULT_ANNUAL.`,
    });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Stripe not configured' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const dbClient = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await dbClient.connect();

    const userRow = await dbClient.query(
      'SELECT id, email, name, stripe_customer_id FROM users WHERE email = $1',
      [normalizedEmail]
    );
    if (userRow.rows.length === 0) {
      await dbClient.end();
      return res.status(404).json({ error: 'No account found. Please sign in first.' });
    }
    const user = userRow.rows[0];

    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: { vault_user_id: String(user.id) },
      });
      customerId = customer.id;
      await dbClient.query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [
        customerId,
        user.id,
      ]);
    }

    // Prefer the actual current host so testing on *.railway.app and prod on
    // vaultwealthiq.com both redirect users back to the same origin they came from.
    const origin =
      req.headers.origin ||
      'https://' + (req.headers.host || process.env.CLIENT_ORIGIN || 'vaultwealthiq.com');

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 14,
        metadata: { vault_user_id: String(user.id), plan },
      },
      allow_promotion_codes: true,
      success_url: `${origin}/?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?stripe=cancel`,
      client_reference_id: String(user.id),
      metadata: { vault_user_id: String(user.id), plan },
    });

    await dbClient.end();
    return res.status(200).json({ url: session.url });
  } catch (err) {
    try {
      await dbClient.end();
    } catch {}
    console.error('Stripe checkout error:', err);
    return res.status(500).json({ error: 'Checkout creation failed: ' + err.message });
  }
}
