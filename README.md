# VAULT — Wealth Intelligence

AI personal-finance SaaS: a net-worth dashboard with live property valuations and a Claude-powered AI advisor, monetized through Stripe subscriptions with a 14-day trial.

**Live:** https://vaultwealthiq.com

## Product

- **Net-worth dashboard** — track assets (real estate, investments, retirement, business equity, cash), liabilities, and accounts in one view. Financial details are stored in the browser (localStorage); account credentials and subscription state live in a server-side Postgres database.
- **Redfin property valuations** — real estate assets auto-value via the Redfin data API (through RapidAPI), with manual override.
- **Claude AI advisor** — `/api/advisor` sends the user's financial summary to Anthropic's Claude API and returns prioritized, dollar-specific recommendations.
- **Stripe subscriptions** — Checkout flow with a 14-day trial, webhook-driven entitlement sync, and a customer billing portal. Paywall unlocks unlimited access after trial.
- **Auth** — email/password registration, login, and a full forgot/reset-password flow (transactional email via Resend).

## Engineering highlights

- **Password hashing** — Node `crypto.scrypt` with per-user salts and timing-safe comparison.
- **CSRF protection** — HMAC-signed, timestamped tokens (24-hour expiry) validated on every state-changing request, including checkout.
- **Stripe webhooks** — raw-body signature verification (`constructEvent`) mounted before `express.json()`, idempotent entitlement updates.
- **Parameterized SQL** — all queries use `$1`-style placeholders via `pg`; no string concatenation.
- **Rate limiting** — tiered `express-rate-limit` (general API, auth endpoints, advisor).
- **Security headers** — helmet, strict CORS allowlist, secret values only via environment variables.

## Stack

- **Frontend:** vanilla JS single-page app (one `index.html`, no build step)
- **Backend:** Express on Node ≥ 22, deployed via Docker on Railway (`railway.json` + `Dockerfile`); legacy `vercel.json` retained for reference
- **Database:** PostgreSQL (Railway)
- **AI:** Anthropic Claude (`/api/advisor`)
- **Data:** Redfin via RapidAPI, Stripe Billing, Resend

## Configuration (environment variables, names only)

`DATABASE_URL`, `CSRF_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_VAULT_MONTHLY`, `STRIPE_PRICE_VAULT_ANNUAL`, `CLAUDE_API_KEY`, `REDFIN_API_KEY`, `RESEND_API_KEY`, `CLIENT_ORIGIN`, `OWNER_EMAIL`, `PORT`

## Notes

- The AI advisor endpoint is admin-gated at the environment level in production deployments.
- The app carries its own financial disclaimers (in-app Terms/Privacy and a persistent footer): VAULT is a tracking and visualization tool, **not** a registered investment advisor, broker-dealer, or financial planner; AI recommendations are educational only.
- Demo seed data uses synthetic addresses and placeholder figures.

---

Portfolio — code shared for review, not licensed for reuse.
