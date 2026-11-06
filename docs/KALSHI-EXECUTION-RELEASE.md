# Kalshi execution candidate — NOT production ready

Live trading remains disabled. No production orders were submitted during this release.

## Implemented and locally tested

- RSA-PSS request signing with queries excluded from the signed path.
- Production/demo host selection and exchange writes denied by default.
- Bounded cursor pagination of orders, fills and positions.
- UP/DOWN buy/sell V2 order construction; IOC and reduce-only sells.
- Durable-intent execution interface with spending reservation before submit and no automatic retry of ambiguous submissions.
- Position-specific profit target, stop-loss and trailing exit decisions.
- Fill quantity/order matching and conservative position mismatch rejection.
- Stop-before-cancel orchestration with cancellation verification and explicit failures.
- Owner-authenticated START rejects release blockers; STOP persists disabled state.

These execution components are not connected to an enabled production worker. Unit tests use mocked exchanges; they are not exchange certification.

## Exact remaining release failures

1. Production owner authentication with the enrolled Kalshi key has not been tested in this session.
2. Buy, sell, partial-fill and cancellation lifecycle has not been tested against an authenticated exchange account.
3. Daily realized/unrealized loss accounting is not implemented in the new execution state machine. The `lossCents` setting is validated but is not an enforced daily loss control. START stays disabled.
4. Durable execution worker and compare-and-swap storage adapter are not implemented. The engine's persist callback requires such an adapter before use.
5. A STOP racing an in-flight order submission has not been fenced. The second stopped check alone cannot prevent that race.
6. Settlement-aware reconciliation and historic order/fill retrieval are not implemented. The current reconciler rejects positions altered by settlement rather than guessing.
7. Owner isolation and storage concurrency are not production-tested.
8. Dashboard START/STOP wiring to a verified live service is not complete.

The readiness endpoint returns named blockers. It must not be changed to report success simply because tests pass or an encryption key exists. Existing Primal signal, paper and flip-history source files were not edited by this candidate.

## Official API references

- https://docs.kalshi.com/api-reference/orders/create-order-v2
- https://docs.kalshi.com/api-reference/orders/cancel-order-v2
- https://docs.kalshi.com/api-reference/portfolio/get-fills
