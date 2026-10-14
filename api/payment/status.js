// Get user's payment/subscription status
import pg from 'pg';
const { Client } = pg;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'GET required' });
  }

  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  const client = new Client({ 
    connectionString: process.env.DATABASE_URL, 
    ssl: { rejectUnauthorized: false } 
  });

  try {
    await client.connect();
    
    const result = await client.query(
      `SELECT paid, plan, trial_start, is_admin, updated_at,
              subscription_status, current_period_end, cancel_at_period_end,
              stripe_customer_id
       FROM users WHERE email = $1`,
      [email.toLowerCase()]
    );

    await client.end();

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    const isAdmin = Boolean(user.is_admin);
    const trialStart = Number(user.trial_start);
    const trialEnd = trialStart + (14 * 24 * 60 * 60 * 1000); // 14 days
    const now = Date.now();

    if (isAdmin) {
      return res.status(200).json({
        paid: true,
        plan: user.plan || 'owner',
        trialActive: true,
        trialDaysRemaining: 9999,
        trialEnds: null,
        isAdmin: true,
      });
    }

    const periodEnd = user.current_period_end ? Number(user.current_period_end) : null;
    return res.status(200).json({
      paid: user.paid,
      plan: user.plan || 'free',
      trialActive: now < trialEnd,
      trialDaysRemaining: Math.max(0, Math.ceil((trialEnd - now) / (24 * 60 * 60 * 1000))),
      trialEnds: new Date(trialEnd).toISOString().split('T')[0],
      isAdmin: false,
      subscriptionStatus: user.subscription_status || null,
      currentPeriodEnd: periodEnd,
      currentPeriodEndDate: periodEnd ? new Date(periodEnd).toISOString().split('T')[0] : null,
      cancelAtPeriodEnd: !!user.cancel_at_period_end,
      hasStripeCustomer: !!user.stripe_customer_id,
    });

  } catch (err) {
    try { await client.end(); } catch {}
    return res.status(500).json({ error: 'Status check failed: ' + err.message });
  }
}
