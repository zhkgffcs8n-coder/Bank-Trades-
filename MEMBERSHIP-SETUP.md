# BANK TRADES membership activation

The public site serves a signup/login page. `/dashboard` and all data/trading Functions require a confirmed Netlify Identity user plus a current membership, free code, or server-owned `owner` role. The build publishes only `dist`; dashboard HTML is bundled privately with the dashboard Function. Do not change publish back to the repository root.

## Netlify

1. Deploy this commit with Node 22.15+ and `npm run build`, publish directory `dist`, Functions `netlify/functions`.
2. Identity is enabled with Open registration and required email confirmation (confirmed by owner screenshot). Register on the public page and confirm the email.
3. In Netlify Identity, edit the owner's user and add `owner` to the **app metadata roles** array. Never put authorization in user metadata. No account is automatically made owner.
4. Sign in to the account page. The owner section generates random, email-bound codes with 1–366 days of access, a seven-day redemption deadline, fixed issue-time expiration, and a separate revocation reference. Store the code when created; only its SHA-256 hash is stored. Copy a code for each member's exact confirmed email. Owners can revoke using the reference.
5. Once the member gate is verified on this deployment, select **Make public** in Netlify project overview/toolbar so visitors can reach signup without a Netlify invitation. Public project visibility does not bypass the app membership gate.

No Supabase is used. Native Netlify Identity and site-wide strongly consistent Netlify Blobs store access records. These must be exercised on a deployed Netlify Function before inviting testers.

## Stripe activation (pending; no live charges activated)

The ChatGPT Stripe connection does not automatically give deployed Netlify Functions a Stripe key. Configure sensitive server-only Netlify environment variables; never paste keys into chat or commit them:

- `STRIPE_RESTRICTED_KEY`: dedicated least-privilege restricted key for this environment (customers, prices/subscriptions read, Checkout sessions and Customer Portal sessions). Use a separate Stripe sandbox first.
- `STRIPE_PRICE_WEEKLY`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_ANNUAL`: owner-confirmed recurring Price IDs for this membership. The public page reads actual amounts and currency from Stripe. No price is inferred from the visual mockup.
- `STRIPE_WEBHOOK_SECRET`: signature secret for `https://neon-gecko-046bff.netlify.app/.netlify/functions/stripe-webhook`.
- `STRIPE_CHECKOUT_ENABLED=true` only after completing sandbox verification, business eligibility review, confirming rates and tax setup. Until then the page supports accounts and free codes without selling memberships.

Configure Customer Portal and subscribe the webhook to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, `charge.dispute.created`, `charge.refunded`, `radar.early_fraud_warning.created`. Verify the webhook endpoint is reachable despite any Netlify site protection.

The webhook verifies signatures on raw bodies, records processed event IDs and payment reviews. Free-code access is independent of payment access. Paid access is read authoritatively from Stripe: active subscription, paid latest invoice, configured price and a current paid period. No access is granted by success URL parameters. Trials and past-due/unpaid/incomplete subscriptions do not grant paid access. A refund, dispute or early fraud warning suspends paid access pending owner review; risk reviews are intentionally not cleared by later/out-of-order events.

Consider Stripe Tax alongside Billing. Verify active tax registrations and applicable obligations before enabling automatic tax; this code does not silently enable it. Use Stripe Dashboard passkeys/2FA. Live business eligibility for trading-related services must be confirmed before activation.

## Test before live activation

Run `npm run build` and `npm run test:membership`. Local mocks verify boundaries but cannot prove Netlify runtime integration. On a real deployment, test signed-out access to `/dashboard`, `/api/data`, and direct Function URLs; confirmed account without membership; owner assignment; code redemption/wrong email/revocation; membership expiration; genuine sandbox Checkout and signed webhooks; unpaid async checkout; renewal failure/cancel/refund/dispute; return from Portal; iPhone email confirmation/recovery; desktop/mobile layout; data refresh, candles, voice opt-in, and paper entry/close.

The requested 2-cent auto-trade fee is not charged. Per-filled-order versus per-contract basis, customer consent and provider eligibility are unresolved. Real-money automation is locked. No guaranteed accuracy or validated self-training is claimed.
