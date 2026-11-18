# Pro Scalper exit changes and rollback

Recorded November 17, 2026 (California time), at the owner's request. Preserve this record for later sessions.

Owner preference: retain an exact way to restore the prior exit behavior if the new reversal-only exits produce unacceptable losses. Do not describe these changes as proven profitable. Do not automatically change the strategy based only on this note; apply the owner's subsequent rollback instruction.

## Known versions

- Previous exit behavior, including the UI/quote improvements and persisted entry/exit records: `2ebc933a4616d8ebe8fdd013001a924e801d1ed9` (PR #196).
- Reversal-only exits: `49bc222c3dfed48400edf12e9d9547ad882374cd` (PR #197).
- Immediate evaluation on new evidence: `9578f852367adedb464e2be21ab1fdb26679d683` (PR #198).

Previous behavior: TIME EXIT at 90 seconds remaining; SELL FAST when current bid is at least five percentage points below original entry ask; TAKE PROFIT at eight points above entry; or strong opposite momentum. These are quote-based calls, not guaranteed fills.

New behavior: no exit from price loss, profit target, or timer alone. Require two distinct fresh opposite-direction observations from the same source (at least one second apart), plus opposite Kalshi bid >=50% and opposite ask dominance. TradingView observation age <=20 seconds; spot candle age <=180 seconds. Repeated timestamps do not confirm. Confirmed exit is TAKE PROFIT if bid is above entry, otherwise SELL FAST. New quote and shared-signal events immediately check the position using fresh matching quotes. Polling/network latency remains.

## Restore previous exit behavior

Use a new branch based on CURRENT main. Revert PR #198 first, then PR #197:

```sh
git revert 9578f852367adedb464e2be21ab1fdb26679d683
git revert 49bc222c3dfed48400edf12e9d9547ad882374cd
npm test
npm run build
```

Resolve any conflicts against later changes deliberately. Review through a PR, merge, and verify the Netlify production build SHA. Keep later unrelated improvements. Do not reset main or redeploy the whole old site as a shortcut.

Preserve large official price displays, compact Coin Crosser boxes, live bid separation, per-coin quote delivery, persistent original entries and exits, voice matching, and KaiBot state. Do not clear saved calls, rewrite past losses, or reopen already-closed calls during rollback. Entry and exit storage remains `btOfficialScalpCallsV1`.

If only the immediate-evidence evaluation causes an issue, revert PR #198 alone; this retains the reversal-only policy.

Validation before the two changes: 585 tests passed. After both changes: 587 tests passed. These checks verify implementation behavior, not live profitability or measured production latency.
