# BANK TRADES PRO — experimental BUY/SELL engine
This build displays BUY YES, BUY NO, WAIT, HOLD, SELL / TAKE PROFIT, or SELL / STOP LOSS REVIEW based on explicit, experimental rules.

BUY requires five live quote samples, a directional movement threshold, two-sided quotes, a spread guardrail, and enough time before closing. SELL/HOLD uses manually entered side, entry price, contract quantity, fees, and current bid. These are **heuristic alerts, not calibrated profitable predictions**; BUY is not an instruction to place a real bet. The 0–100 watchlist score is not a probability or confidence level.

Features: 8-coin market radar, polling, quote chart, ranking, browser speech alerts, position review, and Netlify backend. Automatic real-money orders remain disabled. The site must be open to collect samples and speak.

To deploy: upload the ZIP contents to the root of GitHub repo, replacing index.html and netlify.toml, adding netlify/functions/data.js. Netlify must build from GitHub, publish directory '.', functions directory 'netlify/functions'. Verify /api/data?mode=markets returns JSON. Availability and accuracy have NOT been verified on the deployed site.
