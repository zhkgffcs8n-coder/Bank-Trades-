# Kalshi execution candidate 2 — live execution disabled

All eight requested paths are wired in this candidate. They have not passed authenticated exchange certification or production owner-session checks. No production order was submitted by this development session. The release gate remains hard-disabled, even if a browser payload or environment variable requests START.

| Function | Implementation | Remaining verification |
| --- | --- | --- |
| API authentication | Owner-bound AES-GCM vault; RSA-PSS signed requests | Enrolled production credentials and account identity |
| Automatic buys | Server-side qualified Primal signal consumer; fresh matching quote; IOC V2 order | Authenticated exchange lifecycle |
| Automatic sells | Fill-based quantity; side-aware reduce-only IOC | Exchange partial fills and netting |
| Profit/stop-loss exits | Actual fill costs and fees, trailing peaks, target/stop rules | Live cadence and executable liquidity |
| Spending/loss limits | Atomic durable reservation; order/daily/position limits; realized losses plus full open-cost risk | Production storage concurrency and exchange fee rules |
| Emergency stop | Durable stop fence; in-flight request drain; cancellation and verification of tracked resting orders | Exchange cancellation/race testing |
| Reconciliation | Paginated orders/fills/positions/settlements; terminal evidence cache; quantity and settlement checks | Exchange history retention, settlement and account fixtures |
| Owner START/STOP | Owner auth and same-origin writes; UI wired to shared runtime; START gate | Signed-in owner and non-owner production sessions |

## Operation

- The scheduled runner checks every 60 seconds. Foreground dashboard checks every 5 seconds. This does not provide guaranteed immediate exits; production latency remains a release blocker.
- Owner ID must be configured as `KALSHI_LIVE_OWNER_ID` before START can run. The server revalidates the owner role on each execution.
- A lock has no timed takeover. A crashed worker remains locked for operator review; this prevents a delayed worker and replacement worker from both spending.
- STOP is not liquidation. Existing positions can remain open. A request in flight can fill before cancellation. Pending or unknown outcomes are reported explicitly, never retried as new orders.
- Cancellation is restricted to this bot's tracked orders; unrelated manual orders are untouched.
- Daily budgets use UTC. Gains do not replenish the loss budget. Open cost is reserved in full, conservatively including already paid fees. Each prospective entry also reserves 10 cents per contract for fees. This allowance still needs exchange certification before release.
- Unsupported/malformed, stale, fractional beyond 0.01 contracts, sub-cent execution quotes, conflicting, external or missing evidence blocks trading. This implementation requires an otherwise flat account at START and rejects unmanaged positions/orders.
- Credential changes share the execution lock and are rejected while exposure or ambiguous intents remain.
- Terminal order/fill/settlement evidence is retained in the owner ledger before exchange archival. Missing evidence from before enrollment is never fabricated.
- Existing Primal signals, paper engines and flip history are consumed or preserved without strategy changes.

## Exact remaining external checks

The release endpoint reports: exchange authentication; buy/sell/partial-fill lifecycle; worker latency; concurrent STOP/submit behavior; emergency cancellation; settlement reconciliation; and owner isolation. These need authenticated exchange and deployed-storage evidence. Mock-exchange tests do not satisfy them.

## Official references

- https://docs.kalshi.com/api-reference/orders/create-order-v2
- https://docs.kalshi.com/api-reference/orders/cancel-order-v2
- https://docs.kalshi.com/api-reference/portfolio/get-fills
- https://docs.kalshi.com/api-reference/portfolio/get-settlements
