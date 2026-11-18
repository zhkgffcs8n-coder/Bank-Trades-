(() => {
  'use strict';
  const desk = document.getElementById('btcMarketDesk');
  if (!desk) return;
  const panel = document.createElement('section');
  panel.className = 'btc-intel';
  panel.id = 'btcMarketIntel';
  const windows = [[1,'1s'],[10,'10s'],[30,'30s'],[60,'1m'],[300,'5m'],[600,'10m'],[900,'15m']];
  const metrics = entries => '<dl>' + entries.map(([key, title]) =>
    '<div><dt>' + title + '</dt><dd data-intel="' + key + '">—</dd></div>').join('') + '</dl>';
  const flow = (key, title) => '<div><h4>' + title + '</h4><div class="btc-intel-bar" aria-hidden="true"><i data-flow="' + key +
    '"></i></div><small data-intel="' + key + '">Waiting for trades</small></div>';
  panel.innerHTML = `
    <header><div><h2>BTC Market Intelligence</h2><small>Coinbase spot · Kalshi 15-minute contracts</small></div><small data-intel="source">Waiting for Coinbase ticks</small></header>
    <div class="btc-intel-layout">
      <section class="btc-intel-card btc-intel-chart">
        <h3>BTC spot vs. Kalshi target</h3>
        <div class="btc-intel-controls" aria-label="Spot chart lookback">${windows.map(([seconds, label]) =>
          `<button type="button" data-seconds="${seconds}" aria-pressed="${seconds === 30}">${label}</button>`).join('')}</div>
        <canvas aria-label="Bitcoin spot history, trailing average, Kalshi target and illustrative price bands" role="img"></canvas>
        <small class="btc-intel-legend">Cyan · Coinbase spot　 White · 60s mean　 Gold · Kalshi target　 Violet · projection bands</small>
        <div class="btc-intel-flows">${flow('spotFlow','Coinbase taker flow · 30s')}${flow('kalshiFlow','Kalshi taker flow · 30s')}</div>
      </section>
      <section class="btc-intel-card">
        <h3>Settlement outlook</h3>
        ${metrics([['projected','Projected spot at close'],['band68','68% model band'],['band95','95% model band'],['comparison','Model UP / Kalshi UP midpoint'],['momentum','30s momentum'],['avgGap','60s mean vs. target'],['rsi','Coinbase 1m RSI 14'],['flip','Lock & Flip Radar']])}
        <small>Illustrative zero-drift model using recent Coinbase volatility. Bands and UP estimates are uncalibrated.</small>
      </section>
      <section class="btc-intel-card">
        <h3>Bitcoin snapshot</h3>
        ${metrics([['price','Coinbase BTC-USD'],['highLow','Observed high / low · current round'],['supply','Circulating supply · CoinGecko'],['cap','Market cap · CoinGecko'],['settleCap','Estimated cap at last resolution'],['capChange','Est. cap change vs. prior resolution'],['liveCapChange','Spot vs. last resolution · est. cap change']])}
        <h4>Recent Kalshi resolutions · PT</h4>
        <ul data-rounds></ul>
        <small data-intel="statsSource">Waiting for market stats</small>
      </section>
      <section class="btc-intel-card">
        <header><h3>Kalshi order book</h3><div class="btc-intel-controls" aria-label="Order book outcome">
          <button type="button" data-side="up" aria-pressed="true">UP</button><button type="button" data-side="down" aria-pressed="false">DOWN</button>
        </div></header>
        <small data-intel="book">Waiting for depth</small>
        <table><thead><tr><th scope="col">Side</th><th scope="col">Price</th><th scope="col">Size</th><th scope="col">Depth</th></tr></thead><tbody></tbody></table>
      </section>
    </div>`;
  desk.append(panel);
  const elements = new Map([...panel.querySelectorAll('[data-intel]')].map(el => [el.dataset.intel, el]));
  const set = (key, value) => { const el = elements.get(key); if (el.textContent !== value) el.textContent = value; };
  const canvas = panel.querySelector('canvas');
  const context = canvas.getContext('2d');
  const orderRows = Array.from({length: 8}, () => {
    const row = panel.querySelector('tbody').insertRow();
    return Array.from({length: 4}, () => row.insertCell());
  });
  const roundsList = panel.querySelector('[data-rounds]');
  const dollars = new Intl.NumberFormat('en-US', {style:'currency',currency:'USD'});
  const compact = new Intl.NumberFormat('en-US', {style:'currency',currency:'USD',notation:'compact',maximumFractionDigits:2});
  const pacific = new Intl.DateTimeFormat('en-US', {timeZone:'America/Los_Angeles',hour:'numeric',minute:'2-digit',second:'2-digit'});
  const money = n => Number.isFinite(n) ? dollars.format(n) : '—';
  const pct = n => Number.isFinite(n) ? n.toFixed(1) + '%' : '—';
  let seconds = 30, side = 'up', quote, marketData, statsData, lastFetch = 0, lastStats = 0;
  let busy = false, statsBusy = false, ticker = '';
  const buckets = [];
  const trades = new Map();
  let tradeStart = 0, lastTrade = 0, sequence = null;
  function resetTrades() {
    trades.clear();
    tradeStart = lastTrade = 0;
    sequence = null;
  }
  window.addEventListener('banktrades:btc-trades-reset', resetTrades);
  window.addEventListener('banktrades:btc-trades', ({detail}) => {
    if (!Number.isInteger(detail.sequence_num)) return;
    if (sequence !== null && detail.sequence_num !== sequence + 1) resetTrades();
    sequence = detail.sequence_num;
    const now = Date.now();
    for (const event of detail.events ?? []) {
      if (event.type !== 'update') continue;
      for (const trade of event.trades ?? []) {
        const at = Date.parse(trade.time);
        const value = Number(trade.price) * Number(trade.size);
        if (trade.product_id !== 'BTC-USD' || !trade.trade_id || !['BUY','SELL'].includes(trade.side) ||
            !(at > now - 35_000 && at <= now + 2000) || !Number.isFinite(value) || value <= 0) continue;
        // Market trades report the maker side. Flow uses the opposing taker side.
        trades.set(trade.trade_id, {at,value,aggressiveBuy:trade.side === 'SELL'});
        if (!tradeStart) tradeStart = at;
        lastTrade = Math.max(lastTrade,at);
      }
    }
    for (const [id, trade] of trades) if (trade.at <= now - 35_000) trades.delete(id);
  });
  function spotFlow(now) {
    if (!tradeStart || now - tradeStart < 30_000 || now - lastTrade > 5000) return null;
    const totals = {up:0,down:0,upCount:0,downCount:0};
    for (const trade of trades.values()) {
      if (trade.at <= now - 30_000 || trade.at > now) continue;
      const key = trade.aggressiveBuy ? 'up' : 'down';
      totals[key] += trade.value;
      totals[key + 'Count']++;
    }
    return totals;
  }
  window.addEventListener('banktrades:btc-spot-tick', ({detail}) => {
    const {t, price} = detail;
    if (!Number.isFinite(t) || !Number.isFinite(price) || price <= 0) return;
    const second = Math.floor(t / 1000);
    const previous = buckets.at(-1);
    if (previous && t < previous.t) return;
    if (previous?.second === second) Object.assign(previous, {t, price, high:Math.max(previous.high,price), low:Math.min(previous.low,price)});
    else buckets.push({second,t,price,high:price,low:price});
    while (buckets[0]?.t < t - 960_000) buckets.shift();
  });
  window.addEventListener('banktrades:premium-contracts', ({detail}) => {
    quote = {at:detail.fetched, contract:detail.contracts.find(row => row.asset === 'BTC')};
  });
  panel.addEventListener('click', ({target}) => {
    const button = target.closest('button');
    if (!button) return;
    const key = button.dataset.seconds ? 'seconds' : 'side';
    if (key === 'seconds') seconds = Number(button.dataset.seconds);
    else side = button.dataset.side;
    panel.querySelectorAll('button[data-' + key + ']').forEach(el => el.setAttribute('aria-pressed', String(el === button)));
    render();
  });
  function model(now, contract, price) {
    const points = buckets.filter(p => p.t >= now - 60_000);
    if (!(contract?.strike > 0) || !price || points.length < 10 || points.at(-1).t - points[0].t < 45_000) return null;
    let variation = 0, elapsed = 0;
    for (let i = 1; i < points.length; i++) {
      const gap = points[i].second - points[i - 1].second;
      if (gap > 10) return null;
      variation += (points[i].price - points[i - 1].price) ** 2;
      elapsed += gap;
    }
    const sigma = Math.sqrt(variation / elapsed * (contract.close - now) / 1000);
    if (!(sigma > 0)) return null;
    const z = (price - contract.strike) / sigma;
    const probability = 100 / (1 + Math.exp(-1.702 * z));
    return {price, sigma, probability};
  }
  function draw(now, contract, forecast) {
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    context.setTransform(dpr,0,0,dpr,0,0);
    const cutoff = now - seconds * 1000;
    const history = buckets.filter(p => p.t >= cutoff);
    context.font = '11px system-ui';
    context.fillStyle = '#aab9cf';
    if (!history.length) {
      context.fillText('Collecting live ticks for this window…', 10, 26);
      return;
    }
    const first = Math.max(cutoff, history[0].t - 1000);
    const values = history.map(p => p.price);
    const target = contract?.strike;
    if (target > 0) values.push(target);
    if (forecast) values.push(forecast.price - 1.96 * forecast.sigma, forecast.price + 1.96 * forecast.sigma);
    const min = Math.min(...values), max = Math.max(...values), padding = Math.max(1, (max - min) * .08);
    const end = width - 66, edge = forecast ? end * .76 : end;
    const x = t => 7 + (edge - 7) * (t - first) / Math.max(1000, now - first);
    const y = value => 12 + (height - 40) * (max + padding - value) / (max - min + 2 * padding);
    function line(points, color, dashed = false) {
      context.strokeStyle = color;
      context.setLineDash(dashed ? [5,4] : []);
      context.beginPath();
      points.forEach(([a,b], i) => i ? context.lineTo(a,b) : context.moveTo(a,b));
      context.stroke();
      context.setLineDash([]);
    }
    for (let i = 0; i < 4; i++) {
      const value = min + (max - min) * i / 3;
      line([[7,y(value)],[end,y(value)]], '#273247');
      if (max > min || i === 0) context.fillText(value.toFixed(1),end + 4,y(value) + 4);
    }
    if (forecast) {
      for (const [multiple, color] of [[1.96,'#8860dc30'],[1,'#9c75ed58']]) {
        context.fillStyle = color;
        context.beginPath();
        context.moveTo(x(history.at(-1).t), y(forecast.price));
        context.lineTo(end,y(forecast.price + multiple * forecast.sigma));
        context.lineTo(end,y(forecast.price - multiple * forecast.sigma));
        context.fill();
      }
    }
    if (target > 0) line([[7,y(target)],[end,y(target)]], '#ffd078', true);
    const averages = [];
    let start = 0, sum = 0;
    for (let i = 0; i < buckets.length; i++) {
      const p = buckets[i];
      sum += p.price;
      while (buckets[start].t < p.t - 60_000) sum -= buckets[start++].price;
      if (p.t >= cutoff && p.t - buckets[start].t >= 55_000) averages.push([x(p.t),y(sum / (i - start + 1))]);
    }
    line(averages,'#f3f6fb');
    line(history.map(p => [x(p.t),y(p.price)]),'#4de6eb');
    const last = history.at(-1);
    context.fillStyle = '#4de6eb';
    context.beginPath();
    context.arc(x(last.t), y(last.price), 2.5, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#aab9cf';
    context.fillText(pacific.format(last.t) + ' PT', 8, height - 7);
    if (forecast) context.fillText('Close', end - 28, height - 7);
  }
  function showFlow(key, flow, up, down, format) {
    const total = flow ? flow.up + flow.down : 0;
    const share = total > 0 ? flow.up / total * 100 : NaN;
    panel.querySelector('[data-flow="' + key + '"]').style.width = (Number.isFinite(share) ? share : 0) + '%';
    panel.querySelector('[data-flow="' + key + '"]').parentElement.dataset.empty = String(!total);
    set(key, !flow ? 'Complete window unavailable' : !total ? 'No trades in this window' :
      up + ' ' + pct(share) + ' · ' + format(flow.up) + ' / ' + down + ' ' + pct(100 - share) +
      ' · ' + format(flow.down) + ' · ' + (flow.upCount + flow.downCount) + ' trades');
  }
  function levels(depth, outcome) {
    const book = depth?.orderbook_fp ?? depth?.orderbook ?? depth;
    const dollarLevels = book?.[outcome + '_dollars'];
    const rows = dollarLevels ?? book?.[outcome] ?? [];
    if (!Array.isArray(rows)) return [];
    return rows.map(([p, s]) => [Math.round(Number(p) * (dollarLevels ? 10000 : 100)) / 100, Number(s)])
      .filter(([p, s]) => p > 0 && p < 100 && Number.isFinite(s) && s > 0)
      .sort((a,b) => b[0] - a[0]).slice(0,4);
  }
  function showBook(data) {
    const bids = levels(data?.depth, side === 'up' ? 'yes' : 'no');
    const asks = levels(data?.depth, side === 'up' ? 'no' : 'yes').map(([p,s]) => [100-p,s]);
    const spread = bids.length && asks.length ? asks[0][0] - bids[0][0] : NaN;
    set('book', bids.length || asks.length ? 'Spread ' + (Number.isFinite(spread) ? spread.toFixed(2) + ' pts' : '—') + ' · top four per side' : 'Depth unavailable');
    const withDepth = (rows, label) => {
      let total = 0;
      return rows.map(([p,s]) => [label, p.toFixed(2) + '%', s.toLocaleString(), (total += s).toLocaleString()]);
    };
    const rows = [...withDepth(asks,'Ask').reverse(), ...withDepth(bids,'Bid')];
    orderRows.forEach((cells, i) => {
      cells[0].parentElement.dataset.tone = rows[i]?.[0] ?? '';
      cells.forEach((cell, j) => {
        const value = rows[i]?.[j] ?? '—';
        if (cell.textContent !== value) cell.textContent = value;
      });
    });
  }
  function render() {
    if (document.hidden) return;
    const now = Date.now();
    const contract = quote?.contract?.close > now && now - quote.at < 15_000 ? quote.contract : null;
    const last = buckets.at(-1);
    const spot = last && now - last.t < 10_000 ? last.price : NaN;
    const forecast = model(now,contract,spot);
    const mean = buckets.filter(p => p.t >= now - 60_000);
    const prior = buckets.find(p => p.t >= now - 30_000 && p.t <= now - 25_000);
    const round = contract ? buckets.filter(p => p.t >= contract.close - 900_000) : [];
    const stats = now - Date.parse(statsData?.stats?.at) < 600_000 ? statsData.stats : null;
    const settlements = now - statsData?.at < 180_000 ? statsData.rounds ?? [] : [];
    const cap = value => Number.isFinite(value) && stats?.supply > 0 ? compact.format(value * stats.supply) : '—';
    const settled = settlements[0]?.value ?? NaN;
    const previous = settlements[1]?.value ?? NaN;
    set('source', Number.isFinite(spot) ? 'Coinbase tick ' + pacific.format(last.t) + ' PT' : 'Coinbase ticks unavailable or stale');
    set('price', money(spot));
    set('projected', money(forecast?.price));
    for (const [key,multiple] of [['band68',1],['band95',1.96]]) {
      set(key, forecast ? money(forecast.price - multiple * forecast.sigma) + ' to ' + money(forecast.price + multiple * forecast.sigma) : 'Collecting ticks');
    }
    const mid = contract && contract.yesBid > 0 && contract.yesAsk < 100 && contract.yesAsk >= contract.yesBid ?
      (contract.yesBid + contract.yesAsk) / 2 : NaN;
    set('comparison', pct(forecast?.probability) + ' / ' + pct(mid));
    set('momentum', prior && Number.isFinite(spot) && last.t > prior.t ? money((spot - prior.price) * 1000 / (last.t - prior.t)) + '/s' : '—');
    set('avgGap', contract?.strike > 0 && Number.isFinite(spot) && mean.length && mean.at(-1).t - mean[0].t >= 55_000 ?
      money(mean.reduce((sum,p) => sum + p.price,0) / mean.length - contract.strike) : '—');
    const ta = window.__BANK_TRADES_BTC_EVIDENCE__;
    set('rsi', now - ta?.candleAt >= 60_000 && now - ta.candleAt < 180_000 && Number.isFinite(ta.rsi) ? ta.rsi.toFixed(1) : '—');
    const radar = window.__BANK_TRADES_BTC_LOCK__;
    set('flip', contract && now - radar?.at < 5000 ? radar.flipCandidate ? 'Flip detected · ' + radar.direction : 'No active flip' : '—');
    set('highLow', round.length && Number.isFinite(spot) ? money(Math.max(...round.map(p=>p.high))) + ' / ' + money(Math.min(...round.map(p=>p.low))) : '—');
    set('supply', Number.isFinite(stats?.supply) ? stats.supply.toLocaleString('en-US') + ' BTC' : '—');
    set('cap', Number.isFinite(stats?.cap) ? compact.format(stats.cap) : '—');
    set('settleCap', cap(settled));
    set('capChange', cap(settled - previous));
    set('liveCapChange', cap(spot - settled));
    set('statsSource', stats ? 'CoinGecko snapshot ' + pacific.format(Date.parse(stats.at)) + ' PT · estimates use current supply' : 'CoinGecko snapshot unavailable');
    const text = settlements.map(row => pacific.format(row.close) + ' · ' + row.side + ' · ' + money(row.value));
    if (!text.length) text.push('Verified resolutions unavailable');
    if (text.join('|') !== roundsList.dataset.value) {
      roundsList.dataset.value = text.join('|');
      roundsList.replaceChildren(...text.map(value => {
        const li = document.createElement('li');
        li.textContent = value;
        return li;
      }));
    }
    const data = contract && marketData?.ticker === contract.ticker && now - marketData.at < 15_000 ? marketData : null;
    showFlow('spotFlow',spotFlow(now),'Buy','Sell',n => compact.format(n));
    showFlow('kalshiFlow',data?.flow,'UP','DOWN',n => n.toLocaleString() + ' contracts');
    showBook(data);
    draw(now,contract,forecast);
  }
  async function refresh() {
    if (document.hidden) return;
    const now = Date.now();
    const active = quote?.contract?.close > now && now - quote.at < 15_000 ? quote.contract.ticker : '';
    const read = async query => {
      const response = await fetch('/.netlify/functions/btc-desk?' + query,{signal:AbortSignal.timeout(7000)});
      if (!response.ok) throw new Error('Market data unavailable');
      return response.json();
    };
    if (!statsBusy && now - lastStats >= 60_000) {
      statsBusy = true;
      lastStats = now;
      read('view=stats').then(data => {statsData = data;}, () => {}).finally(() => {statsBusy = false;});
    }
    if (!active || busy || (ticker === active && now - lastFetch < 5000)) return;
    busy = true;
    ticker = active;
    lastFetch = now;
    try { marketData = await read('ticker=' + encodeURIComponent(active)); }
    catch { /* The previous snapshot expires automatically. */ }
    finally { busy = false; }
  }
  const update = () => {render(); refresh();};
  document.addEventListener('visibilitychange', update);
  window.addEventListener('resize', render);
  setInterval(update, 1000);
  update();
})();
