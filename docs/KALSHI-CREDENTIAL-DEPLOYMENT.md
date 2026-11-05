# Kalshi API credential backend — deployment checklist

The owner-only `/.netlify/functions/kalshi-credentials` endpoint is available in source. **This does not connect to Kalshi or permit live orders.** It only encrypts and stores an owner's API key ID and RSA private key.

## Before credential entry

1. Generate a random 32-byte encryption key **outside GitHub** (64 hexadecimal characters). Set `KALSHI_CREDENTIAL_ENCRYPTION_KEY` in Netlify's private environment variables, scoped to Functions. Never paste it into chat, source, or build logs. Preserve it securely: losing it makes existing stored credentials unrecoverable. Changing it requires re-enrollment.
2. Deploy and confirm the endpoint responds to a signed-in, confirmed owner account. Other users must receive 403. Do not expose an unauthenticated proxy.
3. Add a protected UI for owner credential submission, connection status, and deletion; use same-origin POST with JSON over HTTPS. Do not store keys in localStorage, browser logs, analytics, or URLs.
4. Complete independent security review, request-size/rate controls, key rotation, read-only Kalshi signature verification, and connection auditing before accepting production keys.

## Current API behavior

- `GET`: reports `credentialsStored` without revealing the key; `connected:false` means **Kalshi has not been contacted**.
- `POST`: owner-only, same-origin JSON with `keyId` and `privateKeyPem`; requires the private encryption secret and RSA key validation; stores an account-bound AES-GCM envelope in Netlify Blobs.
- `DELETE`: owner-only, same-origin request deletes stored credentials.
- No function sends orders to Kalshi. `liveOrdersEnabled` is always false.

## Required before any real-money auto-trading

Use Kalshi's current official authentication and order APIs; validate account permissions and signing in a read-only test. Add a separate explicit activation step, owner-only server-side order authorization, bounded stake and exposure, daily-loss budget, rate limits, deduplication, persisted order/fill reconciliation, emergency kill switch, and independently running exit monitoring. Test demo orders, partial fills, stale quotes, timeouts, restarts, and emergency stops before permitting live orders. Stops are best-effort; execution and maximum loss are not guaranteed.
