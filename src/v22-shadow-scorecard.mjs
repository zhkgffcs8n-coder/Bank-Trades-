// Offline research only. Each row pairs two engines on the same complete round.
// A verified no-trade round has an empty trades array and contributes zero P&L.
function summarize(rounds, engine) {
  const trades = rounds.flatMap(round => round[engine].trades);
  const net = trade => trade.grossPnl - trade.fees;
  const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  let equity = 0;
  let peak = 0;
  let drawdown = 0;
  for (const round of rounds) {
    for (const trade of round[engine].trades) {
      equity += net(trade);
      peak = Math.max(peak, equity);
      drawdown = Math.max(drawdown, peak - equity);
    }
  }
  const attempts = rounds.reduce((sum, round) => sum + round[engine].executionAttempts, 0);
  return {
    netPnl: equity,
    trades: trades.length,
    winRate: mean(trades.map(trade => Number(net(trade) > 0))),
    maxRealizedDrawdown: drawdown,
    meanEntryDelayMs: mean(trades.map(trade => trade.entryDelayMs)),
    meanExitEfficiency: mean(trades.map(trade => trade.exitEfficiency)),
    executionAttempts: attempts,
    executionReliability: attempts ? trades.length / attempts : null,
  };
}

function validResult(result) {
  return result?.verified === true && Array.isArray(result.trades)
    && Number.isSafeInteger(result.executionAttempts)
    && result.executionAttempts >= result.trades.length
    && result.trades.every(trade => trade
      && [trade.grossPnl, trade.fees, trade.entryDelayMs, trade.exitEfficiency].every(Number.isFinite)
      && trade.fees >= 0 && trade.entryDelayMs >= 0
      && trade.exitEfficiency >= 0 && trade.exitEfficiency <= 1);
}

export function scoreShadowRounds(rounds) {
  const tickers = new Set();
  const paired = [];
  for (const round of rounds) {
    if (typeof round?.ticker !== 'string' || !round.ticker || tickers.has(round.ticker)) {
      throw new Error('Each forward round must have a unique contract ticker');
    }
    tickers.add(round.ticker);
    if (Number.isFinite(round.closedAt) && validResult(round.champion) && validResult(round.challenger)) {
      paired.push(round);
    }
  }
  paired.sort((a, b) => a.closedAt - b.closedAt || a.ticker.localeCompare(b.ticker));
  const champion = summarize(paired, 'champion');
  const challenger = summarize(paired, 'challenger');
  return {
    mode: 'SHADOW_ONLY',
    promotionAuthorized: false,
    pairedRounds: paired.length,
    excludedRounds: rounds.length - paired.length,
    champion,
    challenger,
    pairedNetPnlDelta: paired.length ? challenger.netPnl - champion.netPnl : null,
  };
}
