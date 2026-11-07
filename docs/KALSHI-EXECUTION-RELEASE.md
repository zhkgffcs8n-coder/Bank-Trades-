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

## Follow-up verification, 2026-11-07

Based on main `0f2b18da7c8058cb67f1689dbab9f9f7829b3912`, preserving its newer paper monitoring, learning, demo and dashboard changes.

Production observations before this follow-up:
- `/build-version.json` matched that main commit.
- `/kalshi-demo-status` reported DEMO_AUTHENTICATED, DEMO_PLACEMENT_AND_CANCEL_VERIFIED, UP and DOWN filled and settled demo contracts, including a 0.23-contract partial fill. These are historical deployed reports, not certification of the production execution engine or the new commit. The hold fixture reported positionReconciled=true.
- `/omega-live-health` reported a running collector, but NOT_VERIFIED research: GPT HTTP 429, Gemini HTTP 400, Claude INVALID_RESPONSE. No accuracy or performance improvement is inferred from those reports or the small demo sample.
- The protected dashboard redirected an unauthenticated browser to sign-in. Authenticated owner and non-owner end-to-end tests remain pending.

Repairs:
- Account snapshot age starts before the first request, and is rechecked after durable reservation immediately before submission.
- Cached economic evidence is cloned and contradictions in returning fills, terminal orders and settlements stop reconciliation instead of silently rewriting prior P/L.
- Fractional settlement/sell comparisons tolerate floating-point representation error, but reject economically different quantities.
- Provider parsing reads text blocks without treating reasoning blocks as answers. Gemini keys use the authentication header instead of query strings. Safe error reasons are retained to distinguish configuration from quota problems without leaking upstream messages.
- A separate scheduled `kalshi-demo-lifecycle` uses only the demo host and existing encrypted demo credentials. It runs a bounded UP then DOWN entry/exit test through submitIntent/reconcile/accountRisk, with the same conservative spending/loss limits. Maximum eight submission attempts, one contract per entry, no retries for ambiguous outcomes. It requires a flat, reconciled demo account, default-exchange markets and executable quotes. It reports missing credentials, liquidity, funding or conflicting account state rather than declaring success. Results appear in `kalshi-demo-status.lifecycleTest`. A failed or interrupted run is not automatically restarted.

The seven production release blockers remain in force. Historical demo evidence does not prove the current release's sell lifecycle, production credentials, concurrent STOP/submit timing, production owner isolation, worker latency or settlement accounting. A minute scheduler is not a guaranteed rapid exit service, and a crashed execution lock requires operator review. No real-money request is authorized by this verification work.
