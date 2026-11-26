import { advancePolymarketCall } from './src/polymarket-call.mjs';
import { evaluateScalperV8 } from './src/scalper-v8.mjs';

(() => {
  const coins = ['BTC', 'ETH', 'SOL', 'XRP'];
  const picker = document.querySelector('#poly-coins');
  const title = document.querySelector('#poly-title');
  const clock = document.querySelector('#poly-clock');
  const status = document.querySelector('#poly-status');
  const table = document.querySelector('#poly-quotes');
  const link = document.querySelector('#poly-link');
  const toggle = document.querySelector('#poly-signal-toggle');
  const toggleLabel = document.querySelector('#poly-toggle-label');
  const signalPanel = document.querySelector('#poly-signals');
  const signalStatus = document.querySelector('#poly-signal-status');
  const calls = document.querySelector('#poly-signal-calls');
  const samples = new Map();
  const engines = { A: 'NOVA', B: 'VOLT', C: 'KITSUNE' };
  const engineName = (coin, key) => coin === 'BTC' && key === 'A' ? 'TRADINGVIEW 1s' : engines[key];
  const tracker = document.querySelector('#poly-tracker-positions');
  const trackerEmpty = document.querySelector('#poly-tracker-empty');
  const livePanel = document.querySelector('#poly-live-panel');
  const historyEmpty = document.querySelector('#poly-history-empty');
  const historyList = document.querySelector('#poly-call-history');
  const storageKey = 'banktrades:polymarket-calls:v1';
  const durableKey = `${storageKey}:${window.__BANK_TRADES_USER_ID__}`;
  function readTracking(storage, key) {
    try { return JSON.parse(storage.getItem(key)) ?? {}; } catch { return {}; }
  }
  let tracking = { ...readTracking(sessionStorage, storageKey), ...readTracking(localStorage, durableKey) };
  window.addEventListener('storage', event => {
    if (event.key !== durableKey) return;
    tracking = readTracking(localStorage, durableKey);
    render();
  });
  let selected = 'BTC';
  let snapshot;
  let feedError = '';

  const formatPrice = price => price === null ? '—' : `${Number((price * 100).toFixed(2))}%`;
  function actionBadge(action) {
    const badge = document.createElement('span');
    const label = action.replace(/^FLIP · /, '');
    const kind = label.startsWith('BUY UP') ? 'buy-up'
      : label.startsWith('BUY DOWN') ? 'buy-down'
      : label === 'UP WATCH' ? 'watch-up'
      : label === 'DOWN WATCH' ? 'watch-down'
      : label.startsWith('TAKE PROFIT') ? 'profit'
      : label.startsWith('SELL FAST') ? 'stop'
      : /^(SELL|EXIT|TIME EXIT)/.test(label) ? 'sell'
      : /^(HOLD|UP TRACKED|DOWN TRACKED)/.test(label) ? 'hold' : 'watch';
    badge.className = `poly-action poly-action-${kind}`;
    badge.textContent = action;
    return badge;
  }

  const buttons = coins.map(coin => {
    const button = document.createElement('button');
    button.type = 'button';
    const name = document.createElement('strong');
    name.textContent = coin;
    const call = document.createElement('span');
    const prices = document.createElement('span');
    prices.className = 'poly-tile-prices';
    const metrics = ['entry', 'bid', 'exit'].map(kind => {
      const box = document.createElement('span');
      box.className = 'poly-tile-price ' + kind;
      const label = document.createElement('small');
      const value = document.createElement('b');
      box.append(label, value);
      prices.append(box);
      return { box, label, value };
    });
    button.append(name, call, prices);
    button.addEventListener('click', () => {
      selected = coin;
      render();
    });
    picker.append(button);
    return { button, coin, call, prices, metrics };
  });

  toggle.addEventListener('change', render);

  function recordSamples(data) {
    for (const { coin, market } of data.markets) {
      if (!market) continue;
      const [up, down] = market.quotes;
      const quote = {
        ticker: market.slug, observedAt: market.quoteAt, expiresAt: data.end,
        yesBid: up.bid, yesAsk: up.ask, noBid: down.bid, noAsk: down.ask,
      };
      if (![up.bid, up.ask, down.bid, down.ask].every(Number.isFinite)
          || up.bid > up.ask || down.bid > down.ask) {
        continue;
      }
      const previous = samples.get(coin);
      const history = previous?.quote.ticker === market.slug ? previous.history : [];
      const assessment = Number.isFinite(market.feeRate)
        ? evaluateScalperV8(quote, history, null, price => market.feeRate * price * (1 - price))
        : null;
      const t = Math.floor(market.quoteAt / 2000) * 2000;
      if (!history.length || history.at(-1).t < t) {
        history.push({
          ticker: market.slug, t, observedAt: market.quoteAt,
          yesMid: (up.bid + up.ask + 2 - down.bid - down.ask) / 4,
        });
        if (history.length > 120) history.shift();
      }
      samples.set(coin, { quote, history, assessment });
      trackCalls(coin, market, data, assessment);
    }
  }

  function trackCalls(coin, market, data, assessment) {
    const state = tracking[coin] ??= { positions: {}, events: [], ticker: null };
    if (state.ticker !== market.slug) {
      state.ticker = market.slug;
      state.end = data.end;
      state.positions = {};
    }
    const [up, down] = market.quotes;
    const quotes = {
      up: { bid: up.bid * 100, ask: up.ask * 100 },
      down: { bid: down.bid * 100, ask: down.ask * 100 },
    };
    for (const key of Object.keys(engines)) {
      const engine = engineName(coin, key);
      // One official BTC call follows TradingView. The remaining engines keep
      // displaying any already-open calls until those contracts end.
      const position = state.positions[key];
      if (coin === 'BTC' && key !== 'A' && !position) continue;
      const next = advancePolymarketCall(position, {
        ticker: market.slug, end: data.end, at: market.quoteAt, now: Date.now(),
        quotes, decision: assessment?.engines[key]?.decision,
        live: { coin, feeRate: market.feeRate, tradingView: data.tradingView },
      });
      if (!next || next === position) continue;
      state.positions[key] = next;
      if (position && Boolean(position.exit) === Boolean(next.exit)) continue;
      const side = next.side.toUpperCase();
      const action = next.exit ? `${next.exit.split(' · ')[0]} ${side}`
        : position ? `FLIP · BUY ${side}` : `BUY ${side}`;
      state.events.unshift({
        ticker: market.slug, engine, action, entry: next.entry, exitBid: next.exitBid, at: data.observedAt,
      });
      state.events = state.events.slice(0, 30);
    }
    try {
      const serialized = JSON.stringify(tracking);
      if (localStorage.getItem(durableKey) !== serialized) localStorage.setItem(durableKey, serialized);
    } catch {}
  }

  function currentCall(coin, market, key, name) {
    const signal = market && samples.get(coin)?.assessment?.engines[key];
    const state = tracking[coin];
    const position = state && (!market || state.ticker === market.slug)
      && Date.now() < state.end ? state.positions[key] : null;
    const side = position?.side.toUpperCase();
    const justEntered = position && state.events.some(event => event.ticker === position.ticker
      && event.engine === name && event.action.endsWith(`BUY ${side}`) && Date.now() - event.at < 8000);
    const action = position?.exit ? `${position.exit.split(' · ')[0]} ${side}`
      : position ? `${justEntered ? 'BUY' : 'HOLD'} ${side}`
      : (market && snapshot.end - Date.now() < 120000) || signal ? 'SKIP' : 'WAIT';
    return { position, side, action };
  }

  function freshMarket(coin) {
    const market = snapshot?.markets.find(row => row.coin === coin)?.market;
    return market && Date.now() < snapshot.end && Date.now() - market.quoteAt < 15000 ? market : null;
  }

  function renderCoinCalls() {
    for (const { button, coin, call, prices, metrics } of buttons) {
      button.setAttribute('aria-pressed', String(coin === selected));
      call.hidden = prices.hidden = !toggle.checked;
      if (!toggle.checked) continue;
      const market = freshMarket(coin);
      const engineCalls = Object.keys(engines).map(key => currentCall(coin, market, key, engineName(coin, key)));
      // Keep the displayed entry consistent by preferring the first active engine.
      const active = engineCalls.find(item => item.position && !item.position.exit);
      const displayed = active ?? engineCalls.filter(item => item.position)
        .sort((a, b) => b.position.updatedAt - a.position.updatedAt)[0];
      let action = displayed?.action ?? 'NO QUOTE';
      let entryLabel = 'UP BID';
      let bidLabel = 'DOWN BID';
      let entry = market?.quotes[0]?.bid;
      let bid = market?.quotes[1]?.bid;
      let exit;
      if (displayed) {
        const { position } = displayed;
        entryLabel = 'ENTRY';
        entry = position.entry / 100;
        bid = market?.quotes.find(quote => quote.label.toLowerCase() === position.side)?.bid;
        bidLabel = market ? 'LIVE BID' : 'BID STALE';
        if (Number.isFinite(position.exitBid)) exit = position.exitBid / 100;
      } else if (market) {
        const [up, down] = market.quotes;
        if ([up.bid, up.ask, down.bid, down.ask].every(Number.isFinite)) {
          const lean = up.bid + up.ask - down.bid - down.ask;
          action = Math.abs(lean) < .000001 ? 'EVEN BOOK' : lean > 0 ? 'UP WATCH' : 'DOWN WATCH';
        } else {
          action = 'THIN BOOK';
        }
      }
      if (call.textContent !== action) call.replaceChildren(actionBadge(action));
      button.dataset.direction = displayed?.side?.toLowerCase() ?? '';
      prices.classList.toggle('has-exit', exit !== undefined);
      metrics[2].box.hidden = exit === undefined;
      const labels = [entryLabel, bidLabel, 'EXIT'];
      const values = [entry, bid, exit];
      metrics.forEach(({ label, value }, index) => {
        const formatted = Number.isFinite(values[index]) ? formatPrice(values[index]) : '—';
        if (label.textContent !== labels[index]) label.textContent = labels[index];
        if (value.textContent !== formatted) value.textContent = formatted;
      });
    }
  }

  function renderSignals(market) {
    toggleLabel.textContent = toggle.checked ? 'Signals ON' : 'Signals OFF';
    signalPanel.hidden = !toggle.checked;
    if (!toggle.checked) return;
    const sample = samples.get(selected);
    const assessment = market && sample?.quote.ticker === market.slug ? sample.assessment : null;
    const late = market && snapshot.end - Date.now() < 120000;
    signalStatus.textContent = !market ? feedError || 'Waiting for live Polymarket quotes'
      : selected === 'BTC'
        ? snapshot.tradingView?.status === 'FRESH' && Date.now() - snapshot.tradingView.candleCloseAt <= 20000
          ? 'TradingView BTC 1s · ' + snapshot.tradingView.direction
          : 'Waiting for a fresh TradingView BTC 1s alert'
      : late ? 'Entry window closed · next round in under 2 minutes'
      : market.feeRate === null ? 'Waiting for verified Polymarket fees'
      : assessment?.radar ?? 'Collecting usable quotes for this round';
    const trackedCards = [];
    const rows = Object.keys(engines).map(key => {
      const name = engineName(selected, key);
      const row = document.createElement('tr');
      const { position, side, action } = currentCall(selected, market, key, name);
      row.insertCell().textContent = name;
      const actionCell = row.insertCell();
      actionCell.append(actionBadge(action));
      row.insertCell().textContent = position ? formatPrice(position.entry / 100) : '—';
      const liveBid = position && market?.quotes.find(quote => quote.label.toLowerCase() === position.side)?.bid;
      const bid = position?.exitBid != null ? position.exitBid / 100 : liveBid;
      row.insertCell().textContent = Number.isFinite(bid) ? formatPrice(bid) : '—';
      if (position) {
        const card = document.createElement('article');
        const instruction = document.createElement('strong');
        instruction.append(`${name} `, actionBadge(action));
        if (!market && !position.exit) instruction.append(' · BID UNAVAILABLE');
        const details = document.createElement('p');
        const move = (bid * 100 - position.entry).toFixed(1);
        const bidText = Number.isFinite(bid)
          ? `${position.exit ? 'Bid at exit call' : 'Current bid'} ${formatPrice(bid)} · ${Number(move) > 0 ? '+' : ''}${move} pts before fees`
          : 'Waiting for a fresh Polymarket bid';
        details.textContent = `Entry ${formatPrice(position.entry / 100)} · ${bidText}`;
        const marketLink = document.createElement('a');
        marketLink.href = `https://polymarket.com/event/${position.ticker}`;
        marketLink.target = '_blank';
        marketLink.rel = 'noopener noreferrer';
        marketLink.textContent = 'Open this round on Polymarket';
        card.append(instruction, details);
        if (!position.exit && position.entry > 92) {
          const headroom = document.createElement('small');
          headroom.textContent = `Max upside to 100%: ${Number((100 - position.entry).toFixed(2))} pts before fees`;
          card.append(headroom);
        }
        card.append(marketLink);
        trackedCards.push(card);
      }
      return row;
    });
    calls.replaceChildren(...rows);
    trackerEmpty.hidden = trackedCards.length > 0;
    tracker.replaceChildren(...trackedCards);
    const events = coins.flatMap(coin => (tracking[coin]?.events ?? []).map(event => ({ ...event, coin })))
      .sort((a, b) => b.at - a.at).slice(0, 30);
    historyEmpty.hidden = events.length > 0;
    historyList.replaceChildren(...events.map(event => {
      const item = document.createElement('li');
      const exit = event.exitBid == null ? '' : ` · exit bid ${formatPrice(event.exitBid / 100)}`;
      const coin = document.createElement('b');
      coin.className = 'poly-history-coin';
      coin.textContent = event.coin;
      const meta = document.createElement('div');
      meta.append(`${new Date(event.at).toLocaleTimeString()} `, coin, ` · ${event.engine}`);
      item.append(meta, actionBadge(event.action), ` · Entry ${formatPrice(event.entry / 100)}${exit}`);
      if (event.ticker) {
        const round = document.createElement('a');
        round.href = `https://polymarket.com/event/${event.ticker}`;
        round.textContent = ' · Market';
        item.append(round);
      }
      return item;
    }));
  }

  function render() {
    const remaining = Math.ceil((snapshot?.end - Date.now()) / 1000);
    const fresh = remaining > 0 && Date.now() - snapshot.observedAt < 15000;
    const market = freshMarket(selected);
    renderCoinCalls();
    title.textContent = `${selected} Up or Down`;
    clock.hidden = !fresh;
    clock.textContent = fresh ? `Round ends in ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}` : '';
    table.hidden = !market;
    link.hidden = !market;
    const nextStatus = market ? '' : feedError || 'Waiting for live Polymarket quotes';
    if (status.textContent !== nextStatus) status.textContent = nextStatus;
    renderSignals(market);
    livePanel.hidden = !toggle.checked;
    if (!market) return;
    link.href = `https://polymarket.com/event/${market.slug}`;
    const rows = market.quotes.map(({ label, bid, ask }) => {
      const row = document.createElement('tr');
      for (const value of [label, formatPrice(bid), formatPrice(ask)]) {
        row.insertCell().textContent = value;
      }
      return row;
    });
    table.tBodies[0].replaceChildren(...rows);
  }

  async function refresh() {
    try {
      const response = await fetch('/.netlify/functions/polymarket-15m', { cache: 'no-store' });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) snapshot = undefined;
        const error = await response.json().catch(() => null);
        throw new Error(error?.error || 'Polymarket quote service unavailable');
      }
      snapshot = await response.json();
      feedError = '';
      if (toggle.checked) recordSamples(snapshot);
    } catch (error) {
      feedError = error.message;
    }
    render();
    const untilClose = snapshot ? snapshot.end - Date.now() : Infinity;
    setTimeout(refresh, untilClose > 0 ? Math.min(1500, untilClose + 100) : 1500);
  }

  render();
  refresh();
  setInterval(render, 1000);
})();
