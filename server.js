import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import { fileURLToPath } from 'url';
import path from 'path';

import csrfTokenHandler from './api/auth/csrf-token.js';
import registerHandler from './api/auth/register.js';
import loginHandler from './api/auth/login.js';
import forgotPasswordHandler from './api/auth/forgot-password.js';
import validateResetTokenHandler from './api/auth/validate-reset-token.js';
import resetPasswordHandler from './api/auth/reset-password.js';
import setupHandler from './api/auth/setup.js';

import statusHandler from './api/payment/status.js';
import stripeCheckoutHandler from './api/payment/stripe-checkout.js';
import stripeWebhookHandler from './api/payment/stripe-webhook.js';

import listUsersHandler from './api/admin/list-users.js';
import setAdminHandler from './api/admin/set-admin.js';
import setPaidHandler from './api/admin/set-paid.js';
import billingPortalHandler from './api/billing/portal.js';

import redfinHandler from './api/redfin.js';
import advisorHandler from './api/advisor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || true,
    credentials: true,
  })
);

// Stripe webhook MUST receive raw body for signature verification — mount BEFORE express.json()
app.post(
  '/api/payment/stripe-webhook',
  express.raw({ type: 'application/json', limit: '1mb' }),
  (req, res) => stripeWebhookHandler(req, res)
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});
const advisorLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', apiLimiter);

const adapt = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (err) {
    console.error('Handler error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

app.get('/api/health', (req, res) =>
  res.status(200).json({ ok: true, version: '2.0.0', host: 'railway' })
);

app.get('/api/auth/csrf-token', adapt(csrfTokenHandler));
app.post('/api/auth/register', authLimiter, adapt(registerHandler));
app.post('/api/auth/login', authLimiter, adapt(loginHandler));
app.post('/api/auth/forgot-password', authLimiter, adapt(forgotPasswordHandler));
app.post('/api/auth/validate-reset-token', adapt(validateResetTokenHandler));
app.post('/api/auth/reset-password', authLimiter, adapt(resetPasswordHandler));
app.all('/api/auth/setup', adapt(setupHandler));

app.get('/api/payment/status', adapt(statusHandler));
app.post('/api/payment/stripe-checkout', adapt(stripeCheckoutHandler));

app.post('/api/admin/list-users', adapt(listUsersHandler));
app.post('/api/admin/set-admin', adapt(setAdminHandler));
app.post('/api/admin/set-paid', adapt(setPaidHandler));
app.post('/api/billing/portal', adapt(billingPortalHandler));

app.get('/api/redfin', adapt(redfinHandler));
app.post('/api/advisor', advisorLimiter, adapt(advisorHandler));

app.use('/legal', express.static(path.join(__dirname, 'legal')));

app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`VAULT server listening on port ${PORT}`);
});

const shutdown = (signal) => {
  console.log(`${signal} received, draining...`);
  server.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
