# BANK TRADES PRO — Deploy

## Netlify
Deploy this folder/repository as-is. `netlify.toml` publishes `.` and loads functions from `netlify/functions`.

Routes:
- `/api/data` -> public Kalshi market/orderbook relay
- `/api/trade` -> authenticated account/order relay

## Private environment variables
In Netlify project settings, add these as Environment Variables (never put them in index.html/GitHub):
- `KALSHI_API_KEY_ID` = your Kalshi API key ID
- `KALSHI_PRIVATE_KEY` = complete PEM private key including BEGIN/END lines
- `ENABLE_LIVE_TRADING` = `false` while checking the site; change to `true` when intentionally enabling live execution
- `MAX_CONTRACTS_PER_ORDER` = server hard cap, e.g. `25`
- `MAX_ORDER_COST_USD` = server hard cap, e.g. `50`

Then trigger a Netlify deploy. Open the site and check AUTO BOT CONTROL CENTER. It should change from NO KEYS -> KEYS READY -> LIVE READY based on configuration.

## Important behavior
- Live bot only runs while the webpage is open and armed in that browser session.
- The browser never receives the private key.
- The server independently rejects orders above its configured hard limits.
- Stale/incomplete quote data is rejected by the browser scanner.
- Live order endpoint uses Kalshi V2 event orders and immediate-or-cancel orders.
- The kill button disarms new automatic orders; it does not reverse completed fills.
- No trading strategy guarantees profits. Start with paper mode and small limits.
