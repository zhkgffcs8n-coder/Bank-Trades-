import { replayChampionScalper } from './champion-scalper-replay.mjs';

export function advancePolymarketCall(previous, { ticker, end, at, now, quotes, decision }) {
  const held = previous?.ticker === ticker ? previous : null;
  if (!(at <= now && now - at < 15000 && now < end)) return held;
  if (![quotes.up.bid, quotes.up.ask, quotes.down.bid, quotes.down.ask]
    .every(price => Number.isFinite(price) && price > 0 && price < 100)) return held;
  const secondsLeft = (end - now) / 1000;
  const side = decision === 'UP' || decision === 'DOWN' ? decision.toLowerCase() : null;
  if (held && !held.exit) {
    const next = replayChampionScalper({
      ticker, secondsLeft, side: side ?? 'mixed', strong: Boolean(side), quotes,
    }, held);
    return next.position.exit ? { ...next.position, updatedAt: at } : held;
  }
  if (!side || secondsLeft < 120 || held?.side === side || held?.updatedAt >= at) return held;
  return { ticker, side, entry: quotes[side].ask, exit: null, updatedAt: at };
}
