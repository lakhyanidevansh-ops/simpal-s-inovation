import WebSocket from 'ws'

export type Freshness = 'live' | 'delayed' | 'stale' | 'unavailable'

export type MarkPrint = {
  symbol: string
  price: number
  sourceTime: number
  fetchedAt: number
  ageSeconds: number
  freshness: Freshness
  source: string
  previousClose: number | null
  change: number | null
  changePercent: number | null
  bid: number | null
  ask: number | null
  note: string
}

type TradovateCreds = {
  name: string
  password: string
  appId: string
  appVersion: string
  cid: string
  sec: string
  env: 'demo' | 'live'
  symbol: string
}

const LIVE_MAX_AGE_SEC = 15

function hasTradovateCreds(): TradovateCreds | null {
  const name = process.env.TRADOVATE_NAME?.trim()
  const password = process.env.TRADOVATE_PASSWORD?.trim()
  const appId = process.env.TRADOVATE_APP_ID?.trim()
  const cid = process.env.TRADOVATE_CID?.trim()
  const sec = process.env.TRADOVATE_SEC?.trim()
  if (!name || !password || !appId || !cid || !sec) return null
  const env = process.env.TRADOVATE_ENV === 'live' ? 'live' : 'demo'
  return {
    name,
    password,
    appId,
    appVersion: process.env.TRADOVATE_APP_VERSION?.trim() || '1.0',
    cid,
    sec,
    env,
    symbol: process.env.TRADOVATE_SYMBOL?.trim() || 'NQZ6',
  }
}

function freshnessFromAge(ageSeconds: number, sourceKind: 'rt' | 'delayed'): Freshness {
  if (sourceKind === 'rt') {
    if (ageSeconds <= LIVE_MAX_AGE_SEC) return 'live'
    if (ageSeconds <= 120) return 'delayed'
    return 'stale'
  }
  // Exchange-delayed feeds are never "live"
  if (ageSeconds <= 900) return 'delayed'
  return 'stale'
}

async function fetchYahooMark(symbol = 'NQZ26.CME'): Promise<MarkPrint> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'NQZ6Live/1.0', Accept: 'application/json' },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Yahoo mark HTTP ${res.status}`)
  const data = (await res.json()) as {
    chart?: {
      result?: Array<{
        meta?: {
          regularMarketPrice?: number
          regularMarketTime?: number
          previousClose?: number
          chartPreviousClose?: number
          fulldayChange?: number
          fulldayChangePercent?: number
          regularMarketChangePercent?: number
        }
      }>
    }
  }
  const meta = data.chart?.result?.[0]?.meta
  if (!meta?.regularMarketPrice || !meta.regularMarketTime) {
    throw new Error('Yahoo mark missing price/time')
  }
  const fetchedAt = Date.now()
  const sourceTime = meta.regularMarketTime
  const ageSeconds = Math.max(0, Math.round(fetchedAt / 1000 - sourceTime))
  const previousClose = meta.previousClose ?? meta.chartPreviousClose ?? null
  const change =
    meta.fulldayChange ??
    (previousClose != null ? meta.regularMarketPrice - previousClose : null)
  const changePercent =
    meta.fulldayChangePercent ??
    meta.regularMarketChangePercent ??
    (change != null && previousClose ? (change / previousClose) * 100 : null)

  return {
    symbol,
    price: meta.regularMarketPrice,
    sourceTime,
    fetchedAt,
    ageSeconds,
    freshness: freshnessFromAge(ageSeconds, 'delayed'),
    source: 'Yahoo Finance (CME delayed ~10m)',
    previousClose,
    change,
    changePercent,
    bid: null,
    ask: null,
    note:
      'Free Yahoo CME prints are exchange-delayed (~10 minutes). Not Tradovate/CME real-time.',
  }
}

/** In-memory Tradovate MD cache — populated only when env credentials work. */
type TvCache = {
  price: number
  bid: number | null
  ask: number | null
  sourceTime: number
  updatedAt: number
  symbol: string
  status: 'connecting' | 'live' | 'error' | 'idle'
  error: string | null
}

let tvCache: TvCache | null = null
let tvStarted = false
let tvHeartbeat: ReturnType<typeof setInterval> | null = null

function authUrls(env: 'demo' | 'live') {
  if (env === 'live') {
    return {
      auth: 'https://live.tradovateapi.com/v1/auth/accesstokenrequest',
      md: 'wss://md.tradovateapi.com/v1/websocket',
    }
  }
  return {
    auth: 'https://demo.tradovateapi.com/v1/auth/accesstokenrequest',
    md: 'wss://md-demo.tradovateapi.com/v1/websocket',
  }
}

async function startTradovateFeed(creds: TradovateCreds) {
  if (tvStarted) return
  tvStarted = true
  tvCache = {
    price: 0,
    bid: null,
    ask: null,
    sourceTime: 0,
    updatedAt: 0,
    symbol: creds.symbol,
    status: 'connecting',
    error: null,
  }

  const urls = authUrls(creds.env)
  try {
    const authRes = await fetch(urls.auth, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        name: creds.name,
        password: creds.password,
        appId: creds.appId,
        appVersion: creds.appVersion,
        cid: Number(creds.cid),
        sec: creds.sec,
      }),
    })
    const authJson = (await authRes.json()) as {
      errorText?: string
      accessToken?: string
      mdAccessToken?: string
    }
    if (!authRes.ok || authJson.errorText || !authJson.accessToken) {
      throw new Error(authJson.errorText || `Tradovate auth HTTP ${authRes.status}`)
    }

    const token = authJson.mdAccessToken || authJson.accessToken
    const ws = new WebSocket(urls.md)
    let reqId = 1

    ws.on('open', () => {
      ws.send(`authorize\n0\n\n${token}`)
    })

    ws.on('message', (buf) => {
      const raw = buf.toString()
      if (raw === 'o') return
      if (raw === 'h') return
      if (!raw.startsWith('a') && !raw.startsWith('a[')) {
        // heartbeats / other frames
        if (raw === '[]') return
      }
      try {
        const payload = raw.startsWith('a') ? JSON.parse(raw.slice(1)) : JSON.parse(raw)
        const frames = Array.isArray(payload) ? payload : [payload]
        for (const frame of frames) {
          if (frame?.i === 0 && frame?.s === 200) {
            // authorized — subscribe quote
            const body = JSON.stringify({ symbol: creds.symbol })
            ws.send(`md/subscribeQuote\n${reqId++}\n\n${body}`)
            if (tvCache) {
              tvCache.status = 'live'
              tvCache.error = null
            }
          }
          const entries = frame?.d ?? frame
          const list = Array.isArray(entries) ? entries : [entries]
          for (const item of list) {
            const q = item?.entries || item?.quote || item
            // Tradovate quote packets vary; look for last/bid/ask
            const last =
              q?.last ??
              q?.tradePrice ??
              q?.lp ??
              item?.lastPrice ??
              item?.entries?.[creds.symbol]?.last
            const bid = q?.bid ?? q?.bidPrice ?? null
            const ask = q?.offer ?? q?.ask ?? q?.askPrice ?? null
            if (typeof last === 'number' && last > 0 && tvCache) {
              tvCache.price = last
              tvCache.bid = typeof bid === 'number' ? bid : tvCache.bid
              tvCache.ask = typeof ask === 'number' ? ask : tvCache.ask
              tvCache.sourceTime = Math.floor(Date.now() / 1000)
              tvCache.updatedAt = Date.now()
              tvCache.status = 'live'
            }
            // nested map form: { entries: { NQZ6: { last: ... } } }
            if (item?.entries && typeof item.entries === 'object') {
              const symQ = item.entries[creds.symbol] || Object.values(item.entries)[0]
              if (symQ && typeof (symQ as { last?: number }).last === 'number') {
                const s = symQ as { last: number; bid?: number; offer?: number }
                tvCache!.price = s.last
                tvCache!.bid = s.bid ?? tvCache!.bid
                tvCache!.ask = s.offer ?? tvCache!.ask
                tvCache!.sourceTime = Math.floor(Date.now() / 1000)
                tvCache!.updatedAt = Date.now()
                tvCache!.status = 'live'
              }
            }
          }
        }
      } catch {
        // ignore parse noise
      }
    })

    ws.on('error', (err) => {
      if (tvCache) {
        tvCache.status = 'error'
        tvCache.error = err.message
      }
    })

    ws.on('close', () => {
      if (tvCache) {
        tvCache.status = 'error'
        tvCache.error = tvCache.error || 'Tradovate MD socket closed'
      }
      tvStarted = false
    })

    // Tradovate expects heartbeats
    if (tvHeartbeat) clearInterval(tvHeartbeat)
    tvHeartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send('[]')
    }, 2500)
  } catch (err) {
    if (tvCache) {
      tvCache.status = 'error'
      tvCache.error = err instanceof Error ? err.message : 'Tradovate start failed'
    }
    tvStarted = false
  }
}

export function tradovateStatus() {
  const creds = hasTradovateCreds()
  return {
    configured: Boolean(creds),
    cache: tvCache,
    envVarsNeeded: [
      'TRADOVATE_NAME',
      'TRADOVATE_PASSWORD',
      'TRADOVATE_APP_ID',
      'TRADOVATE_APP_VERSION',
      'TRADOVATE_CID',
      'TRADOVATE_SEC',
      'TRADOVATE_ENV',
      'TRADOVATE_SYMBOL',
    ],
  }
}

export async function getBestMark(): Promise<MarkPrint & { tradovateConfigured: boolean }> {
  const creds = hasTradovateCreds()
  if (creds) {
    void startTradovateFeed(creds)
  }

  if (
    tvCache &&
    tvCache.status === 'live' &&
    tvCache.price > 0 &&
    tvCache.updatedAt > 0
  ) {
    const ageSeconds = Math.max(0, Math.round((Date.now() - tvCache.updatedAt) / 1000))
    if (ageSeconds <= LIVE_MAX_AGE_SEC) {
      return {
        symbol: tvCache.symbol,
        price: tvCache.price,
        sourceTime: tvCache.sourceTime || Math.floor(tvCache.updatedAt / 1000),
        fetchedAt: Date.now(),
        ageSeconds,
        freshness: 'live',
        source: `Tradovate MD (${creds?.env ?? 'demo'})`,
        previousClose: null,
        change: null,
        changePercent: null,
        bid: tvCache.bid,
        ask: tvCache.ask,
        note: 'Real-time Tradovate market data (requires CME MD entitlement on the account).',
        tradovateConfigured: true,
      }
    }
  }

  // No inventing — fall back to honest delayed Yahoo
  const yahoo = await fetchYahooMark('NQZ26.CME')
  return {
    ...yahoo,
    tradovateConfigured: Boolean(creds),
    note: creds
      ? `Tradovate configured but no fresh RT tick yet (${tvCache?.status ?? 'idle'}${tvCache?.error ? `: ${tvCache.error}` : ''}). Showing delayed Yahoo — not inventing prices.`
      : yahoo.note,
  }
}
