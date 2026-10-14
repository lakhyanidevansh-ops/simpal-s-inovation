# NQZ6 Live

Near-live **Nasdaq-100 Dec futures (NQZ6 / NQZ26.CME)** monitor on the **5-minute** timeframe for Gujju Gaming / Trading Cycle.

The app polls Yahoo Finance every **20 seconds** (via a Vite dev proxy), redraws the 5m candle chart, and refreshes a **next-candle suggestion** (bias, expected direction vs last close, invalidation).

## Run locally

```bash
npm install
npm run dev
```

Open **http://127.0.0.1:4317** (port is fixed in `vite.config.ts`).

## Scripts

| Command        | What it does              |
|----------------|---------------------------|
| `npm run dev`  | Dev server on port 4317   |
| `npm run build`| Typecheck + production build |
| `npm run preview` | Preview production build |

## Notes

- Quotes come from Yahoo’s CME chart endpoint and are often **delayed** vs the live futures book.
- Browser calls go to `/api/yahoo/...`, rewritten by Vite to `query1.finance.yahoo.com`.
- This is a tactical 5m aid, not investment advice.
