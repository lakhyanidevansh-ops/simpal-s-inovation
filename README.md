# NQZ6 Live (Tradovate-style)

Near-live **Nasdaq-100 Dec futures (NQZ6 / NQZ26.CME)** on the **5-minute** chart for Gujju Gaming / Trading Cycle.

The UI is a **Tradovate-style** dark trading desk (chart + order-ticket-adjacent panel) — **not** TradingView branding/layout. It polls Yahoo Finance every **20 seconds**, redraws 5m candles, and highlights the **forming candle + projected next 5m zone** in bullish/bearish/neutral colors tied to the live next-candle suggestion.

## Run locally

```bash
npm install
npm run dev
```

Open **http://127.0.0.1:4317** (port fixed in `vite.config.ts`).

## What you see

- Dark Tradovate-like chart chrome (grid, crosshair, price/time axes, green/red candles)
- Right-side order-ticket panel with bias / expect-close / invalidation
- `FORMING` + `NEXT` markers that refresh on each poll

## Notes

- Yahoo CME quotes are often delayed vs the live book.
- Browser calls go to `/api/yahoo/...` (Vite proxy).
- Tactical 5m aid only — not investment advice.
