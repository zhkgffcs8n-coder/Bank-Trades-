# BANK TRADES PRO checkpoint

Updated October 30, 2026 UTC.

## User objective
Responsive black/gold terminal for iPhone and computers; live Kalshi 15-minute crypto data, candles, voice/on-screen alerts, paper KaiBot and measurable learning. Public signup with paid membership and owner-issued free codes. Stripe chosen; user explicitly rejects Supabase. Team testing before live execution.

## Implemented in source
- Earlier fixes: missing DOM IDs, script syntax, compact terminal, selectable markets, stale/crossed quote checks, polling, 1m YES-bid candles, EMA5/simple RSI14, voice UP/DOWN/WAIT, on-screen alerts and 60s quote observations.
- New public responsive account page: native Netlify Identity signup/login, confirmation, recovery/invites, signout and membership UI. Open registration and required email confirmation confirmed by user screenshot. Native Identity SDK 2.0.0 used in modern Netlify Functions.
- Dashboard HTML is served only through a member-gated Function. Build publishes an explicit public allowlist into dist; private HTML/server source are excluded. Direct data, Kalshi, spot and demo trading Functions all use fresh server-owned Identity membership checks. No client storage role grants access.
- Netlify Blobs email-bound free codes with random secrets (hash-only storage), fixed expiration, seven-day redemption deadline, atomic claim, owner-only issue/revoke, immediate revocation checks. Owner role must be assigned manually in Netlify Identity app metadata. No first-signup administrator shortcut.
- Stripe subscription Checkout/Portal and signature-verified lifecycle/risk webhook source. Concurrent Checkout serialized; retries idempotent; reuse open sessions. Paid access requires actual configured-price active subscription, paid latest invoice and current paid period. Free codes also supported without Stripe credentials. No live prices or charges activated. Configuration and rates remain pending: see MEMBERSHIP-SETUP.md.
- Per-account device-local simulated ledger, safe cross-tab write locks, bid-price simulated exits, realized paper P/L before fees. Expired positions do not pretend to sell or auto-settle.
- Experimental online research learner stores predictions BEFORE outcomes, fetches finalized binary market records, updates small bounded residual logistic weights and compares prospective Brier score with entry-ask baseline. Does not control orders; device-local and not validated predictive accuracy. Exportable research dataset. 60s quote movement remains separate from settlement learning.
- Build, 15 meaningful membership/payment-boundary/model/outcome/paper-accounting tests pass locally. Server Functions bundle; dashboard scripts parse. Desktop signup and dashboard layout inspected in static browser preview. Static preview has no Netlify backend; not a production data/login test. Physical iPhone rendering/voice still need live verification.

## Access / deployment
Source is to be pushed to main with an expected-head lease; auto-publishing was on in owner screenshots. Previous confirmed screenshot was main@2ff1e56. Latest anonymous browser check saw Netlify 'This site is private'; live deployment of this update and public signup are NOT yet verified. Cloud-browser sign-in handoff failed repeatedly on iPhone; do not repeat the same loop. Owner can use existing Safari session.

## Required activation
1. Verify this build deployed with publish=dist (never repo root), Node22 and native Identity/Blobs available.
2. Register/confirm owner's account; assign owner in server-owned Identity app metadata roles. Test code issue/redeem/revoke on deployed Functions. No working production code can be honestly supplied until owner access exists.
3. Make Netlify project public using project overview/toolbar **Make public**, then verify signed-out signup page and protected dashboard/APIs.
4. Confirm actual recurring membership prices; configure a dedicated Stripe sandbox RAK, recurring Price IDs, mandatory signed lifecycle/risk webhook and Customer Portal in Netlify sensitive variables. Test paid/unpaid/renewal/cancel/refund/dispute paths. Review eligibility and tax registrations before enabling live Checkout. Stripe connector access does not inject credentials into Netlify Functions.
5. Test on actual iPhone and desktop: email links, login, code expiry/revocation, fresh feeds/rollover, candles, voice opt-in, alerts, concurrent tabs, paper buy/sell, finalized-outcome journal/export. Assess latency and out-of-sample results with fees/slippage before any execution changes.

## Limits / unfinished
- No guaranteed accuracy, future-flip knowledge, proven profitable edge, calibrated public win percentage, or validation from a few test wins.
- No real-money order execution or trade-fee charging. Requested 2-cent fee basis (per filled order vs per contract), consent and provider eligibility unresolved.
- Polling roughly 12s quotes, 20s candles, 30s pending final outcomes; foreground browser required for paper bot/learning. Voice requires user activation; iOS background delivery not promised.
- Research learner is local to account+device, not shared across team and not server-trained. Stores at most 1,000 prospective observations; historical replay/independent holdout validation not implemented. Learning updates parameters, does not guarantee improved results, and does not automatically change entry rules.
- Paper fees/market impact and automatic settlement accounting not implemented. No virtual number is presented as real account performance.
- Public visibility, owner role, Stripe runtime configuration and end-to-end production tests need owner account access. Do not claim production complete until verified.
