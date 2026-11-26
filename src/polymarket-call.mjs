import { replayChampionScalper } from './champion-scalper-replay.mjs';

export function advancePolymarketCall(previous, { ticker, end, at, now, quotes, decision, live }) {
  const held = previous?.ticker === ticker ? previous : null;
  if (!(at <= now && now - at < 15000 && now < end)) return held;
  if (![quotes.up.bid, quotes.up.ask, quotes.down.bid, quotes.down.ask]
    .every(price => Number.isFinite(price) && price > 0 && price < 100)) return held;
  const secondsLeft = (end - now) / 1000;
  const feed = live?.tradingView;
  const freshBtc = live?.coin === 'BTC' && feed?.status === 'FRESH'
    && feed.candleCloseAt > end - 900000 && feed.candleCloseAt < end
    && now >= feed.candleCloseAt && now - feed.candleCloseAt <= 20000;
  const direction = live?.coin === 'BTC' ? (freshBtc ? feed.direction : null) : decision;
  const side = direction === 'UP' || direction === 'DOWN' ? direction.toLowerCase() : null;
  if (held && !held.exit) {
    if (live) {
      const opposite = held.side === 'up' ? 'down' : 'up';
      const aligned = side === opposite && quotes[opposite].bid >= 50
        && quotes[opposite].ask > quotes[held.side].ask;
      const evidenceAt = freshBtc ? feed.candleCloseAt : at;
      const prior = held.reversalAt;
      const confirmed = aligned && prior != null && evidenceAt - prior >= 1000 && evidenceAt - prior <= 15000;
      const bid = quotes[held.side].bid;
      const fee = price => live.feeRate * (price / 100) * (1 - price / 100);
      const net = (bid - held.entry) / 100 - fee(held.entry) - fee(bid);
      const profit = Number.isFinite(net) && net > .000001;
      const exit = live.coin === 'BTC'
        ? (profit && (bid >= 80 || bid >= held.entry * 1.2 || confirmed) ? 'TAKE PROFIT' : null)
        : (confirmed ? (profit ? 'TAKE PROFIT' : 'SELL FAST') : null);
      if (exit) return { ...held, exit, exitBid: bid, updatedAt: at };
      const reversalAt = aligned ? (prior != null && evidenceAt - prior < 1000 ? prior : evidenceAt) : null;
      return (prior ?? null) === reversalAt ? held : { ...held, reversalAt };
    }
    const next = replayChampionScalper({
      ticker, secondsLeft, side: side ?? 'mixed', strong: Boolean(side), quotes,
    }, held);
    return next.position.exit ? { ...next.position, updatedAt: at } : held;
  }
  if (secondsLeft < 120 || held?.updatedAt >= at) return held;
  if (live && (!Number.isFinite(live.feeRate) || (live.coin === 'BTC' && (secondsLeft < 420 || held)))) return held;
  const entry = side ? quotes[side].ask : null;
  if (entry === null || entry < 40 || entry > 80 || (live && entry - quotes[side].bid > 3.000001) || held?.side === side) {
    return held?.flipWatchAt ? { ...held, flipWatchAt: null } : held;
  }
  if (held) {
    if (held.flipWatchAt === at) return held;
    if (!(held.flipWatchAt < at && at - held.flipWatchAt < 15000 && held.flipWatchAt > held.updatedAt)) {
      return { ...held, flipWatchAt: at };
    }
  }
  return { ticker, side, entry, exit: null, updatedAt: at };
}
