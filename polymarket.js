(() => {
  const coins = ['BTC', 'ETH', 'SOL', 'XRP'];
  const picker = document.querySelector('#poly-coins');
  const title = document.querySelector('#poly-title');
  const clock = document.querySelector('#poly-clock');
  const status = document.querySelector('#poly-status');
  const table = document.querySelector('#poly-quotes');
  const link = document.querySelector('#poly-link');
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
