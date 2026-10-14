const SYMBOL = 'NQZ26.CME'
const UA = 'Mozilla/5.0 (compatible; NQZ6Live/1.0)'

export async function fetchYahooChart(interval = '5m', range = '5d') {
  const params = new URLSearchParams({
    interval,
    range,
    includePrePost: 'true',
  })
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(SYMBOL)}?${params}`
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Yahoo chart HTTP ${res.status}`)
  return res.json()
}

export async function fetchYahooMark() {
  const data = await fetchYahooChart('1m', '1d')
  const meta = data?.chart?.result?.[0]?.meta
  if (!meta?.regularMarketPrice || !meta.regularMarketTime) {
    throw new Error('Yahoo mark missing price/time')
  }
  const fetchedAt = Date.now()
  const sourceTime = meta.regularMarketTime
  const ageSeconds = Math.max(0, Math.round(fetchedAt / 1000 - sourceTime))
  const previousClose = meta.previousClose ?? meta.chartPreviousClose ?? null
  const change =
    previousClose != null ? meta.regularMarketPrice - previousClose : null
  const changePercent =
    change != null && previousClose ? (change / previousClose) * 100 : null

  return {
    symbol: SYMBOL,
    price: meta.regularMarketPrice,
    sourceTime,
    fetchedAt,
    ageSeconds,
    tickGapUs: null,
    freshness: ageSeconds <= 900 ? 'delayed' : 'stale',
    source: 'Yahoo Finance delayed (Netlify function — NOT Tradovate WS)',
    previousClose,
    change,
    changePercent,
    bid: null,
    ask: null,
    note:
      'Netlify serverless cannot hold a Tradovate WebSocket. Showing delayed Yahoo. For LIVE ticks run npm run dev locally with Tradovate env vars.',
    feedMode: 'yahoo-delayed',
    tradovateConfigured: Boolean(
      process.env.TRADOVATE_NAME && process.env.TRADOVATE_PASSWORD,
    ),
    tradovateStatus: 'netlify-static',
  }
}

export function json(body, status = 200) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(body),
  }
}
