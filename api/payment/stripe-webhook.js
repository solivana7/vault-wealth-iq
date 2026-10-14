// Stripe webhook receiver — verifies signature, handles subscription lifecycle.
// IMPORTANT: this route MUST receive the raw request body (Buffer), NOT JSON-parsed,
// or signature verification will fail. server.js mounts express.raw() for this path.
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

  const signature = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !secret) {
    console.error('Stripe webhook missing signature or secret');
    return res.status(400).json({ error: 'Missing signature or secret' });
  }

  // req.body must be a Buffer (raw bytes) at this point — see server.js routing
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, secret);
  } catch (err) {
    console.error('Stripe signature verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const dbClient = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await dbClient.connect();

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.client_reference_id || session.metadata?.vault_user_id;
        const customerId = session.customer;
        const subscriptionId = session.subscription;
        const plan = session.metadata?.plan || null;

        if (userId) {
          await dbClient.query(
            `UPDATE users
               SET paid = true,
                   plan = COALESCE($1, plan),
                   stripe_customer_id = $2,
                   stripe_subscription_id = $3,
                   subscription_status = 'active',
                   updated_at = NOW()
             WHERE id = $4`,
            [plan, customerId, subscriptionId, userId]
          );
          console.log(`Marked user ${userId} as paid via subscription ${subscriptionId}`);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const status = sub.status; // active | trialing | past_due | canceled | unpaid
        const periodEnd = sub.current_period_end ? sub.current_period_end * 1000 : null;
        const cancelPending = !!sub.cancel_at_period_end;
        await dbClient.query(
          `UPDATE users
             SET subscription_status = $1,
                 current_period_end = $2,
                 cancel_at_period_end = $3,
                 paid = CASE WHEN $1 IN ('active','trialing') THEN true ELSE paid END,
                 updated_at = NOW()
           WHERE stripe_subscription_id = $4`,
          [status, periodEnd, cancelPending, sub.id]
        );
        console.log(`Subscription ${sub.id} updated → status=${status}, cancelPending=${cancelPending}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await dbClient.query(
          `UPDATE users
             SET paid = false,
                 subscription_status = 'canceled',
                 cancel_at_period_end = false,
                 updated_at = NOW()
           WHERE stripe_subscription_id = $1 AND is_admin = false`,
          [sub.id]
        );
        console.log(`Subscription ${sub.id} canceled — user marked unpaid`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;
        await dbClient.query(
          `UPDATE users
             SET subscription_status = 'past_due',
                 updated_at = NOW()
           WHERE stripe_subscription_id = $1`,
          [subscriptionId]
        );
        console.warn(`Payment failed for subscription ${subscriptionId}`);
        break;
      }

      default:
        // No-op for unhandled event types — return 200 so Stripe doesn't retry
        break;
    }

    await dbClient.end();
    return res.status(200).json({ received: true });
  } catch (err) {
    try {
      await dbClient.end();
    } catch {}
    console.error('Stripe webhook handler error:', err);
    // Return 200 anyway so Stripe doesn't retry — log for triage
    return res.status(200).json({ received: true, warning: err.message });
  }
}
