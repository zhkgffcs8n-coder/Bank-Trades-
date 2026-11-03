// Official finalized binary outcomes only. Used by paper research and paper settlement.
// In particular, Number(null) === 0 must never turn an absent payout into a NO win.
export const SETTLEMENT_VERIFICATION = 'STRICT_FINALIZED_BINARY_V1';
export function verifiedFinalizedBinaryOutcome(market, ticker) {
  if (!market || typeof ticker !== 'string' || market.ticker !== ticker ||
      market.status !== 'finalized' || market.market_type !== 'binary' ||
      market.is_provisional === true) return null;
  const result = market.result;
  const raw = market.settlement_value_dollars;
  // Number('  '), Number(false), and Number('0x0') all equal zero, but none
  // is a trustworthy official binary payout. Accept only literal 0/1 amounts
  // in Kalshi's ordinary decimal-dollar representation (or finite numbers).
  if (!['yes', 'no'].includes(result) ||
      !(typeof raw === 'number' ||
        (typeof raw === 'string' && /^(?:0|1)(?:\\.0+)?$/.test(raw)))) return null;
  const payout = Number(raw);
  if (!Number.isFinite(payout) || payout !== (result === 'yes' ? 1 : 0)) return null;
  return result;
}
export function trustedStoredFinalizedOutcome(outcome, ticker) {
  return outcome?.ticker === ticker && outcome.verification === SETTLEMENT_VERIFICATION &&
    ['yes', 'no'].includes(outcome.result) ? outcome.result : null;
}
