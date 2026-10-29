# BANK TRADES PRO · Research terminal

Read-only Kalshi 15-minute market dashboard, 8 crypto and 8 commodity series, public order-book snapshots and optional Coinbase independent crypto spot references.

## Deploy with Netlify (GitHub import recommended)
1. Create a new GitHub repository and upload the **contents of this folder** (index.html, netlify.toml, netlify/functions/data.js).
2. In Netlify, Add new project → Import an existing project → GitHub → select repo.
3. Leave build command empty and publish directory `.`; the included netlify.toml controls Functions.
4. Deploy. The site calls `/api/data`. Verify the market and diagnostics panels after it loads.

Note: Drag-and-drop static upload methods may not deploy Netlify Functions. Use Git import or the Netlify CLI (`netlify deploy --prod --dir=. --functions=netlify/functions`).

## Architecture and limits
- Public Kalshi REST quotes and order-book snapshots, not continuously streaming WebSocket.
- Coinbase spot is an **independent reference** and is **not** the Kalshi settlement oracle.
- Quotes are updated approximately every 12 seconds *while a browser tab is visible*; no guaranteed latency or uptime.
- Signal defaults to WAIT because there is no calibrated directional model, and price/spread alone does not prove a profitable edge.
- Missing/unavailable markets explicitly show offline/closed. Data errors never turn into fake prices.
- No accounts, API keys, trade execution or membership authentication.
- For credible predictive signals: collect timestamped Kalshi/settlement-oracle data on an always-on server; validate out-of-sample probability calibration, track realistic fills and fees; implement real-time streaming with reconnect and monitoring.
- Verify the exact series, settlement rules, distribution rights, and current API fields with Kalshi before commercial use.
