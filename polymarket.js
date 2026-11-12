import { replayChampionScalper } from './src/champion-scalper-replay.mjs';
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
  const tracker = document.querySelector('#poly-tracker-positions');
  const trackerEmpty = document.querySelector('#poly-tracker-empty');
  const liveRows = document.querySelector('#poly-live-rows');
  const historyEmpty = document.querySelector('#poly-history-empty');
  const historyList = document.querySelector('#poly-call-history');
  const storageKey = 'banktrades:polymarket-calls:v1';
  let tracking = {};
  try { tracking = JSON.parse(sessionStorage.getItem(storageKey)) || {}; } catch {}
  let selected = 'BTC';
  let snapshot;

  const formatPrice = price => price === null ? '—' : `${Number((price * 100).toFixed(2))}%`;
  const buttons = coins.map(coin => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = coin;
    button.addEventListener('click', () => {
      selected = coin;
      render();
    });
    picker.append(button);
    return button;
  });

  toggle.addEventListener('change', render);

  function recordSamples(data) {
    for (const { coin, market } of data.markets) {
      if (!market) {
        samples.delete(coin);
        continue;
      }
      const [up, down] = market.quotes;
      const quote = {
        ticker: market.slug, observedAt: data.observedAt, expiresAt: data.end,
        yesBid: up.bid, yesAsk: up.ask, noBid: down.bid, noAsk: down.ask,
      };
      if (![up.bid, up.ask, down.bid, down.ask].every(Number.isFinite)
          || up.bid > up.ask || down.bid > down.ask) {
        samples.delete(coin);
        continue;
      }
      const previous = samples.get(coin);
      const history = previous?.quote.ticker === market.slug ? previous.history : [];
      const assessment = evaluateScalperV8(quote, history);
      const t = Math.floor(data.observedAt / 60000) * 60000;
      if (history.at(-1)?.t !== t) {
        history.push({
          ticker: market.slug, t, observedAt: data.observedAt,
          yesMid: (up.bid + up.ask) / 2,
        });
        if (history.length > 5) history.shift();
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
    const secondsLeft = (data.end - data.observedAt) / 1000;
    for (const [key, engine] of Object.entries(engines)) {
      const signal = assessment?.engines[key];
      const qualified = signal?.decision === 'UP' || signal?.decision === 'DOWN';
      const position = state.positions[key];
      if (position?.exit || (!position && (!qualified || secondsLeft < 120))) continue;
      const side = qualified ? signal.decision.toLowerCase() : 'mixed';
      const next = position
        ? replayChampionScalper({ ticker: market.slug, secondsLeft, side, strong: qualified, quotes }, position)
        : { action: `BUY ${signal.decision}`, position: { ticker: market.slug, side, entry: signal.ask * 100, exit: null } };
      state.positions[key] = next.position;
      if (!position || next.position.exit) {
        const flip = next.position.exit === 'EXIT · MOMENTUM REVERSED';
        state.events.unshift({
          engine, action: flip ? `FLIP WATCH ${side.toUpperCase()} · ${next.action}` : next.action,
          entry: next.position.entry, exitBid: next.position.exitBid, at: data.observedAt,
        });
        state.events = state.events.slice(0, 30);
      }
    }
    try { sessionStorage.setItem(storageKey, JSON.stringify(tracking)); } catch {}
  }

  function currentCall(coin, market, key, name) {
    const signal = market && samples.get(coin)?.assessment?.engines[key];
    const state = tracking[coin];
    const position = state && (!market || state.ticker === market.slug)
      && Date.now() < state.end ? state.positions[key] : null;
    const side = position?.side.toUpperCase();
    const justEntered = position && state.events.some(event => event.engine === name
      && event.action === `BUY ${side}` && Date.now() - event.at < 8000);
    const action = position?.exit ? `${position.exit.split(' · ')[0]} ${side}`
      : position ? `${justEntered ? 'BUY' : 'HOLD'} ${side}`
      : (market && snapshot.end - Date.now() < 120000) || signal ? 'SKIP' : 'WAIT';
    return { position, side, action };
  }

  function renderLiveSignals(fresh) {
    const rows = coins.flatMap(coin => {
      const market = fresh && snapshot.markets.find(row => row.coin === coin)?.market;
      return Object.entries(engines).map(([key, name]) => {
        const { position, action } = currentCall(coin, market, key, name);
        const row = document.createElement('tr');
        row.insertCell().textContent = coin;
        row.insertCell().textContent = name;
        const signal = row.insertCell();
        signal.textContent = !market && position && !position.exit ? `${action} · BID UNAVAILABLE` : action;
        if (action.startsWith('BUY') || action.startsWith('TAKE PROFIT')) signal.dataset.side = 'UP';
        if (action.startsWith('SELL FAST')) signal.dataset.side = 'DOWN';
        row.insertCell().textContent = position ? formatPrice(position.entry / 100) : '—';
        return row;
      });
    });
    liveRows.replaceChildren(...rows);
  }

  function renderSignals(market) {
    toggleLabel.textContent = toggle.checked ? 'Signals ON' : 'Signals OFF';
    signalPanel.hidden = !toggle.checked;
    if (!toggle.checked) return;
    const sample = samples.get(selected);
    const assessment = market && sample?.quote.ticker === market.slug ? sample.assessment : null;
    const late = market && snapshot.end - Date.now() < 120000;
    signalStatus.textContent = !market ? 'Waiting for live Polymarket quotes'
      : late ? 'Entry window closed · next round in under 2 minutes'
      : assessment?.radar ?? 'Collecting usable quotes for this round';
    const trackedCards = [];
    const rows = Object.entries(engines).map(([key, name]) => {
      const row = document.createElement('tr');
      const { position, side, action } = currentCall(selected, market, key, name);
      row.insertCell().textContent = name;
      const actionCell = row.insertCell();
      actionCell.textContent = action;
      if (action.startsWith('BUY') || action.startsWith('TAKE PROFIT')) actionCell.dataset.side = 'UP';
      if (action.startsWith('SELL FAST')) actionCell.dataset.side = 'DOWN';
      row.insertCell().textContent = position ? formatPrice(position.entry / 100) : '—';
      const liveBid = position && market?.quotes.find(quote => quote.label.toLowerCase() === position.side)?.bid;
      const bid = position?.exitBid != null ? position.exitBid / 100 : liveBid;
      row.insertCell().textContent = Number.isFinite(bid) ? formatPrice(bid) : '—';
      if (position) {
        const card = document.createElement('article');
        const instruction = document.createElement('strong');
        instruction.textContent = !market && !position.exit ? `${name} · HOLD ${side} · BID UNAVAILABLE` : `${name} · ${action}`;
        if (actionCell.dataset.side) instruction.dataset.side = actionCell.dataset.side;
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
        card.append(instruction, details, marketLink);
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
      item.textContent = `${new Date(event.at).toLocaleTimeString()} · ${event.coin} · ${event.engine} · ${event.action} · entry ${formatPrice(event.entry / 100)}${exit}`;
      return item;
    }));
  }

  function render() {
    const remaining = Math.ceil((snapshot?.end - Date.now()) / 1000);
    const fresh = remaining > 0 && Date.now() - snapshot.observedAt < 15000;
    const market = fresh && snapshot.markets.find(row => row.coin === selected)?.market;
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.textContent === selected)));
    title.textContent = `${selected} Up or Down`;
    clock.textContent = fresh ? `Round ends in ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}` : '';
    table.hidden = !market;
    link.hidden = !market;
    const nextStatus = market ? '' : 'Waiting for live Polymarket quotes';
    if (status.textContent !== nextStatus) status.textContent = nextStatus;
    renderSignals(market);
    if (toggle.checked) renderLiveSignals(fresh);
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
      if (!response.ok) throw new Error('Market data unavailable');
      snapshot = await response.json();
      recordSamples(snapshot);
    } catch {
      snapshot = undefined;
    }
    render();
    setTimeout(refresh, 4000);
  }

  render();
  refresh();
  setInterval(render, 1000);
})();
