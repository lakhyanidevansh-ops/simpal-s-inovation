# NQZ6 Live (Tradovate-style UI)

Near-live **Nasdaq-100 Dec futures (NQZ6)** monitor for Gujju Gaming / Trading Cycle.

## Accuracy (read this)

| Mode | When | Freshness label |
|------|------|-----------------|
| **DELAYED** | Default — Yahoo CME print | Age usually ~**10 minutes**. Banner shows **DELAYED**. |
| **LIVE** | Tradovate MD credentials + CME entitlement | Age ≤ **15s**. Banner shows **LIVE**. |

**True real-time is not available without user keys.** Free Yahoo / public CME web quotes are exchange-delayed. This app will **not invent** “live” prices.

## Run

```bash
cp .env.example .env   # optional: fill Tradovate vars for LIVE
npm install
npm run dev
```

Open **http://127.0.0.1:4317**

### Tradovate env vars (for LIVE)

```
TRADOVATE_NAME=
TRADOVATE_PASSWORD=
TRADOVATE_APP_ID=
TRADOVATE_APP_VERSION=1.0
TRADOVATE_CID=
TRADOVATE_SEC=
TRADOVATE_ENV=demo          # or live
TRADOVATE_SYMBOL=NQZ6
```

Also need Tradovate **API Access** add-on and a **CME market-data** entitlement. Endpoints used: `auth/accesstokenrequest` + `wss://md-demo.tradovateapi.com` (or live MD host).

## What polls

- `/api/mark` every **3s** — Tradovate RT if configured & fresh, else delayed Yahoo (honestly labeled)
- Yahoo **5m** candles for chart structure (still delayed when Yahoo-backed)

## UI

Tradovate-**style** dark desk (not TradingView branding). Large mark, change/%, source as-of, data age, DELAYED/LIVE banner, NEXT-candle highlight.
