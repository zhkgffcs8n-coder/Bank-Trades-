// One-contract, taker-only research. Prices and fees are in dollars.
export function researchFee(price, multiplier) {
  return Math.ceil((0.07 * multiplier * price * (1 - price) - 1e-12) * 10000) / 10000;
}

export function stepShadow(previous, sample, signal) {
  const {at, ticker, closesAt, book, feeMultiplier} = sample;
  const state = previous ?? {ticker};
  if (state.ticker !== ticker || state.closed || !book || at >= closesAt ||
      at <= (state.lastAt ?? 0) || !Number.isFinite(feeMultiplier) || feeMultiplier <= 0) return state;
  const next = {...state, lastAt: at};
  const intent = state.intent;
  if (!state.entry && !intent && ['UP', 'DOWN'].includes(signal)) {
    return {...next, intent: {action: 'BUY ' + signal, side: signal, at,
      quotedPrice: 1 - (signal === 'UP' ? book.no : book.yes).price}};
  }
  if (!intent) {
    if (!state.entry) return next;
    const {side, price, at: enteredAt, fee} = state.entry;
    const bid = side === 'UP' ? book.yes : book.no;
    const net = bid.price - price - fee - researchFee(bid.price, feeMultiplier);
    const action = net >= 0.03 ? 'TAKE PROFIT' : net <= -0.06 || at - enteredAt >= 30000 ? 'SELL FAST' : 'HOLD';
    return action === 'HOLD' ? {...next, lastDecision: {action, side, at, bid: bid.price}}
      : {...next, intent: {action, side, at, quotedPrice: bid.price}};
  }
  if (at - intent.at < 500) return next;
  if (at - intent.at > 5000) return {...next, intent: null, missedFills: (state.missedFills ?? 0) + 1};
  const buy = !state.entry;
  const level = (intent.side === 'UP') === buy ? book.no : book.yes;
  if (level.size < 1) return next;
  const price = buy ? Math.round((1 - level.price) * 10000) / 10000 : level.price;
  const fill = {at, price, depth: level.size, fee: researchFee(price, feeMultiplier), decision: intent,
    observedSlippage: buy ? price - intent.quotedPrice : intent.quotedPrice - price};
  if (buy) return {...next, intent: null, entry: {...fill, side: intent.side}};
  const grossPnl = price - state.entry.price;
  const fees = fill.fee + state.entry.fee;
  return {...next, intent: null, closed: {exit: fill, grossPnl, fees, netPnl: grossPnl - fees}};
}

export function settleShadow(state, outcome, at) {
  if (!state?.entry || state.closed || !['yes', 'no'].includes(outcome)) return state;
  const payout = Number((state.entry.side === 'UP') === (outcome === 'yes'));
  const grossPnl = payout - state.entry.price;
  const fees = state.entry.fee;
  return {...state, intent: null, closed: {
    exit: {at, action: 'OFFICIAL_SETTLEMENT', outcome, price: payout, fee: 0},
    grossPnl, fees, netPnl: grossPnl - fees,
  }};
}
