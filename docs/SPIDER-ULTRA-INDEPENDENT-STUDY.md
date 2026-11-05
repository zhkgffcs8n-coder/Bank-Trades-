# Spider Ultra feature study — independent Primal implementation plan

Status: research specification only. No proprietary Spider Ultra source code, model weights, training records or authenticated trade logs were provided. The screenshots alone cannot establish algorithm internals or validate displayed 94–96% win rates.

## Observed UI (screenshots supplied by owner)
- Forecaster ranking: Sirius, Vega, Andromeda, Orion, Lyra, Polaris, Draco, Comet, Pegasus, with reported win-rate percentages; "Your AI" selector.
- Kalshi connected status, paper/live tabs, per-bet dollar limits, run duration, aggression slider, configurable profit-taking and stop-loss in dollars or percentages.
- "Passed" decisions when no two-sided quote, risk guard exceeded, or insufficient crypto-side funds.
- Owner's Kalshi screenshots show some winning trades, but no time-matched mapping between individual Spider Ultra predictions and Kalshi executions.

## Build independently, never copy a proprietary service
1. Timestamp Kalshi market ID, contract, best executable bid/ask, spread, order-book depth, spot reference, forecast and model version BEFORE each decision. Reject stale/crossed/one-sided quotes.
2. Independent candidate forecasters: momentum/trend, mean reversion, volatility regime, order-book imbalance, time-to-expiry, cross-timeframe confirmation. Keep original Primal unchanged as baseline. Do not assume names correspond to Spider Ultra's private algorithms.
3. Per-model forward-only outcome journal with settlement provenance; measure sample count, accuracy, Brier score, log loss, net P/L after fees/slippage, maximum drawdown and calibration by confidence bucket. Never show unsupported "95%" figures. Rank on prospective held-out data; block auto-promotion if confidence intervals overlap or profitability is unproven.
4. Position manager uses confirmed Kalshi fills, real contract count, entry cost, bid-side executable exit quote, fees, partial fills, market liquidity and time remaining. Enforce max entry stake, max total exposure, max daily loss, max orders per round, rate limits, idempotency, max spread, stale feed cutoff and emergency kill switch. Profit and loss triggers are best-effort orders, not guaranteed fills.
5. Server-owned authenticated Kalshi integration: owner/account isolation, supported RSA or Ed25519 signing, encrypted secret management, no browser localStorage or GitHub secrets, restricted order permissions, audit log, test/demo connection first. Separate explicit live activation after a successful demo and security review.
6. Independent always-on worker and durable queue needed for exits when browser is closed; Netlify request functions alone do not establish continuous monitoring. Reconcile orders/positions on restart and after outages.
7. Run a shadow A/B study against current Primal and paper simulator, using prospective observations and identical markets, before considering any live order routing.

## Release gates
- Unit tests for price math, fees, partial fills, stale quotes, order retries, kill switch and drawdown.
- Demonstrate read-only account connection, demo trades, position reconciliation and safe automatic exits.
- No unattended live execution until these tests pass and owner separately confirms exact stake, daily loss and duration limits.
- Do not claim a strategy is accurate from screenshots, self-reported win rates or a handful of winning settlements.

Official API reference: https://docs.kalshi.com/
