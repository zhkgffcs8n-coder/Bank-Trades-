# Predator streaming worker

Run a single Node.js 22.15+ process on a Linux host with outbound HTTPS/WSS and a persistent writable volume. Run `npm ci --omit=dev` from the repository checkout. Configure a service manager to restart on failure, deliver SIGTERM on stop, and run:

```sh
mkdir -p "$PREDATOR_STATE_DIR"
flock -n "$PREDATOR_STATE_DIR/worker.lock" node scripts/predator-worker.mjs
```

Use a private state directory with mode 0700. Back up state.json. The ledger is replaced atomically and holds open positions, observed rounds, completed paper outcomes and rejection counts. Run one instance per state directory. Start with the paper flag absent.

| Setting | Purpose |
|---|---|
| PREDATOR_STATE_DIR | Required persistent state directory |
| PREDATOR_KALSHI_KEY_ID | Kalshi API key ID for authenticated depth |
| PREDATOR_KALSHI_PRIVATE_KEY_FILE | Mounted private PEM file, readable only by the worker |
| PREDATOR_NETLIFY_SITE_ID | Optional Netlify site ID for publishing health |
| PREDATOR_NETLIFY_TOKEN | Optional Netlify credential with access to the site's Blobs store |
| PREDATOR_ENABLE_EXPERIMENTAL_PAPER | Set to true to opt into one-contract forward research simulations |

A Netlify web deploy installs the scheduled burst collector and health endpoint. Start the persistent process separately on its Linux host. Supply both Netlify publishing settings to write the heartbeat. The status endpoint reports a missing or stale heartbeat separately from the scheduled burst, which has gaps between invocations.

V16 records at most one prospective probe per BTC contract and evaluates fresh bids at 3, 6, 10, 20, 30 and 60 seconds. Paper entries require the explicit paper flag and qualified prior-round evidence. Old V15 positions and outcomes retain their version and accounting.

The worker uses public Kalshi REST depth when the authenticated book is unavailable and never submits exchange orders. The existing Netlify collectors continue independently. If configured, health appears under worker at /.netlify/functions/predator-report. Confirm that the heartbeat stays fresh across round boundaries, evaluations advance, bookSource is KALSHI_WS, and Coinbase and Kalshi event ages are present before claiming authenticated streaming. REST snapshots have no exchange-event timestamp. A gap invalidates the incremental book until a new snapshot arrives.

V17 early-entry research records one prospective probe per direction per BTC round on Kalshi WebSocket depth. It scores 1, 3, 5, 10, 30 and 60 seconds using later executable bids and publishes sample counts and a lower bound for the historical profitable-exit rate. The V18 paper entry rules remain the baseline. V17 probes cannot create positions.
