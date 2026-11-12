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
  const signalPanel = document.querySelector('#poly-signals');
  const signalStatus = document.querySelector('#poly-signal-status');
  const calls = document.querySelector('#poly-signal-calls');
  const samples = new Map();
  const engines = { A: 'NOVA', B: 'VOLT', C: 'KITSUNE' };
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
    }
  }

  function renderSignals(market) {
    signalPanel.hidden = !toggle.checked;
    if (!toggle.checked) return;
    const sample = samples.get(selected);
    const assessment = market && sample?.quote.ticker === market.slug ? sample.assessment : null;
    signalStatus.textContent = assessment?.radar ?? (market ? 'Collecting usable quotes for this round' : 'Waiting for fresh quotes');
    const items = Object.entries(engines).map(([key, name]) => {
      const item = document.createElement('li');
      const signal = assessment?.engines[key];
      const action = !signal ? 'WAIT' : signal.decision === 'SKIP' ? 'SKIP' : `BUY ${signal.decision} · ${formatPrice(signal.ask)} ask`;
      item.textContent = `${name} · ${action}`;
      return item;
    });
    calls.replaceChildren(...items);
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
