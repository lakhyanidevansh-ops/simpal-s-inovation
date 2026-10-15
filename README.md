# NQZ6 Live (Tradovate MD)

Live **Nasdaq-100 Dec (NQZ6)** desk for Gujju Gaming / Trading Cycle.

**Not TradingView.** Marks come from **Tradovate market data** when API credentials are set. Without keys, the only fallback is **exchange-delayed Yahoo** (labeled DELAYED) — never invented “live” prices.

## Feed modes

| Mode | When | Update rate |
|------|------|-------------|
| **LIVE tick stream** | `TRADOVATE_*` env + CME MD entitlement | Every Tradovate MD tick via SSE `/api/ticks` (shows gap in µs between ticks) |
| **DELAYED** | No keys / MD not connected yet | Yahoo CME print ~10 minutes late |

Browser paint is **tick-driven**, not a fixed poll. Exchange ticks are not a literal 1µs wall clock — the UI updates as soon as each Tradovate tick arrives and reports the measured gap in microseconds.

## Run (local — LIVE Tradovate ticks)

```bash
cp .env.example .env   # required for LIVE Tradovate ticks
npm install
npm run dev
```

Open **http://127.0.0.1:4317**

## Accuracy stack (extra packages)

Installed for stronger live signals (still near-price caps ~0.12%):

- `technicalindicators` — EMA, ATR, RSI, MACD, Bollinger, Stochastic, ADX
- `simple-statistics` — return z-scores for momentum

Five strategies vote and reweight as each 5m bar closes (browser localStorage).

## Deploy on Netlify

This repo is calibrated for Netlify static + functions:

| Setting | Value |
|---------|--------|
| Build command | `npm run build` |
| Publish directory | `dist` |
| Functions | `netlify/functions` (from `netlify.toml`) |

1. Import the GitHub repo in Netlify.
2. Leave build settings to `netlify.toml` (or set publish = `dist`).
3. Optional env: `TRADOVATE_*` (status only — **WebSocket ticks need local `npm run dev`**; Netlify serves delayed Yahoo marks via functions).

Blank white screen was caused by Vite loading the Tradovate socket during `vite build`. That is fixed: the feed loads only in `vite` serve mode, and Netlify functions cover `/api/*`.

### Tradovate env (required for LIVE)

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

Needs Tradovate **API Access** and a **CME market-data** entitlement.

Endpoints: `auth/accesstokenrequest` → `wss://md-demo.tradovateapi.com` (or live MD) with `md/subscribeQuote` + `md/getChart` (Tick + 5m MinuteBar).

## APIs

- `GET /api/ticks` — SSE; `event: mark` on every Tradovate tick
- `GET /api/mark` — latest mark snapshot
- `GET /api/candles` — Tradovate 5m bars when subscribed (204 if not ready)
- `GET /api/tradovate-status` — connection / tick diagnostics
