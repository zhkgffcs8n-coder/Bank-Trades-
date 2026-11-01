# BANK TRADES PRO — deployment and execution status

## Verified source configuration (November 1, 2026)

Netlify builds with `npm run build`, publishes `dist`, and uses `netlify/functions` (see `netlify.toml`).

The authenticated trading relay at `netlify/functions/lib/legacy/trading.cjs` currently targets `https://demo-api.kalshi.co/trade-api/v2`. It is **demo only**, with a strict allowlist and a maximum of two YES-buy contracts per request. It does not implement real-money automated execution, automatic sell orders, or production portfolio synchronization. Never represent a demo fill as a real fill.

The scheduled `netlify/functions/kaibot-runner.mjs` is a **paper simulation**. It currently sets `entryPaused=true` as a safety circuit breaker following paper losses. It can continue collecting research signals and processing previously opened paper positions, but does not open new paper entries while paused. Its paper exits use sampled bids on a scheduled cadence; they do not guarantee executable exits or a capped loss.

The scheduled `netlify/functions/market-collector.mjs` samples public market data approximately once per minute. Training and outcome scoring require official finalized results. More frequent samples alone do not establish improved accuracy.

## Deployment checks

1. Run `npm test` and `npm run build` with Node 22. Confirm no failed tests or build errors.
2. Verify Netlify published the intended Git commit and that scheduled functions execute successfully. A GitHub commit alone is not proof of deployment.
3. Check the collector heartbeat, per-market telemetry, pending/resolved settlement counts, and any incomplete paginated performance reports.
4. Verify membership-gated pages and APIs from signed-in and signed-out sessions.
5. Test paper-entry and paper-exit accounting, idempotency, stale quotes, trading fees, and loss scenarios before lifting the paper-entry circuit breaker.
6. Keep live-money trading disabled until a separately reviewed implementation has authenticated position reads, correct order semantics, server-enforced limits, kill switch, reconciliation, and an explicit owner-controlled enablement step.

## Credentials

Do not put API private keys in GitHub, dashboard HTML, browser storage, logs, or chat messages. The current demo relay uses signed request headers; the server rejects raw private-key payloads. Do not add production credentials expecting this demo-only relay to become a production trader.

## Known limits

No guaranteed win rate or profit, no tick-level stop execution, no guaranteed exit at a stop price, and no validated autonomous live-trading bot. Paper returns exclude some execution costs and may differ substantially from live results.
