# BANK TRADES PRO checkpoint

Updated October 29, 2026 (America/Los_Angeles).

## User goal
Responsive iPhone/desktop terminal resembling supplied black/gold reference; candlesticks, fast on-screen and voice alerts, paper KaiBot, public signup with paid membership and owner-granted free access. Team testing before live trading.

## Implemented
- 2ff1e56: fixed missing DOM elements that caused false feed errors; repaired paper script and duplicate HTML tail.
- 6454889: compact responsive terminal, navigation and selectable market chart.
- 5f7e5f8: UP/DOWN voice terminology, selected market synchronization, stale/invalid/crossed-book/sample-gap checks.
- 27906a8: one-minute Kalshi YES-bid candles, EMA5/simple RSI14 descriptive overlays, on-screen alerts, browser-local 60-second forward observation journal, daily virtual-spend cap derived from stored paper trades.
- Scripts parse. Mock feed, signal guardrail and candle route checks passed. These checks do NOT establish predictive accuracy or profitability.

## Confirmed deployment/access
User screenshots confirmed 2ff1e56 published. Later commits pushed to main with auto-publishing enabled, but production verification remains blocked: unauthenticated browser sees Netlify 'This site is private'. User can change project visibility using Make public from project overview/Netlify toolbar. Cloud browser authentication handoff failed on user's iPhone; do not repeat that loop.

## Not implemented / not verified
- Real-money trading, automatic training/retraining, settlement-based evaluation, out-of-sample accuracy, guaranteed profit, and tick-by-tick alert latency are not implemented.
- Current quotes poll roughly every 12 seconds; candles fetch roughly every 20 seconds while open. Voice requires user activation and foreground page.
- Journal records bid-minus-entry-ask after 60 seconds on this device; excludes fees/impact, is not a settlement win rate, and does not train a model.
- Paper simulation is experimental; verify multi-tab behavior, sell/settlement accounting, fees/slippage, stale quote handling, contract rollover and UI rendering before team test claims.
- Public signup, member entitlement checks, paid checkout, free-access redemption codes and server-side data protection remain pending. Do not claim dashboard is membership-gated.
- Stripe connected; user authorized Bornforrichez live account for memberships. No BANK TRADES products existed at read. No payment products or fees were activated. Supabase awaiting connection. Do not request secrets in chat.
- User requested 2-cent auto-trade platform fee; per-filled-order vs per-contract is unresolved. Do not activate a fee without resolving basis, consent and provider eligibility.
- Displayed membership prices have not been explicitly confirmed for live billing. Ask before creating paid pricing.

## Next actions
1. Make Netlify project public, verify public route and API behavior without invited account.
2. Confirm latest deployment; visually test mobile/desktop candle chart, market selection, voice opt-in, banners, paper bot and observation journal.
3. Connect auth/database, build and test member gates and owner-issued limited free codes; keep testing private if exposing unrestricted dashboard is unwanted until gates exist.
4. Confirm memberships, implement verified Stripe checkout/webhooks/portal and evaluate business eligibility before collecting payments.
5. Persist timestamped signals and actual outcomes, evaluate on unseen periods with fees/slippage, compare with fixed baseline; retain prior version and rollback when results worsen. Do not call rapid rule adjustment 'AI learning' or infer reliability from a few wins.
