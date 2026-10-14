import { EventEmitter } from 'node:events'
import WebSocket from 'ws'
import type { Candle } from '../src/lib/types.ts'

export type Freshness = 'live' | 'delayed' | 'stale' | 'unavailable'

export type MarkPrint = {
  symbol: string
  price: number
  sourceTime: number
  fetchedAt: number
  ageSeconds: number
  /** Measured gap between last two Tradovate ticks (µs). Null if unknown. */
  tickGapUs: number | null
  freshness: Freshness
  source: string
  previousClose: number | null
  change: number | null
  changePercent: number | null
  bid: number | null
  ask: number | null
  note: string
  tradovateConfigured?: boolean
  tradovateStatus?: string
  feedMode?: 'tradovate-tick' | 'yahoo-delayed'
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

const LIVE_MAX_AGE_SEC = 2
const TICK_LISTENERS = new EventEmitter()
TICK_LISTENERS.setMaxListeners(50)

type TvCache = {
  price: number
  bid: number | null
  ask: number | null
  sourceTimeMs: number
  updatedAt: number
  lastTickAt: number
  prevTickAt: number
  symbol: string
  status: 'connecting' | 'live' | 'error' | 'idle' | 'auth'
  error: string | null
  previousClose: number | null
  candles5m: Candle[]
  tickCount: number
}

let tvCache: TvCache | null = null
let tvStarted = false
let tvWs: WebSocket | null = null
let tvHeartbeat: ReturnType<typeof setInterval> | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reqId = 1

function hasTradovateCreds(): TradovateCreds | null {
  const name = process.env.TRADOVATE_NAME?.trim()
  const password = process.env.TRADOVATE_PASSWORD?.trim()
  // name + password are enough to attempt auth; appId/cid/sec optional
  // (API key pair from Tradovate → Apps improves reliability).
  if (!name || !password) return null
  const env = process.env.TRADOVATE_ENV === 'live' ? 'live' : 'demo'
  return {
    name,
    password,
    appId: process.env.TRADOVATE_APP_ID?.trim() || 'NQZ6Live',
    appVersion: process.env.TRADOVATE_APP_VERSION?.trim() || '1.0',
    cid: process.env.TRADOVATE_CID?.trim() || '',
    sec: process.env.TRADOVATE_SEC?.trim() || '',
    env,
    symbol: process.env.TRADOVATE_SYMBOL?.trim() || 'NQZ6',
  }
}

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

function freshnessFromAge(ageSeconds: number, sourceKind: 'rt' | 'delayed'): Freshness {
  if (sourceKind === 'rt') {
    if (ageSeconds <= LIVE_MAX_AGE_SEC) return 'live'
    if (ageSeconds <= 30) return 'delayed'
    return 'stale'
  }
  if (ageSeconds <= 900) return 'delayed'
  return 'stale'
}

function tickGapUs(): number | null {
  if (!tvCache || !tvCache.prevTickAt || !tvCache.lastTickAt) return null
  return Math.max(0, Math.round((tvCache.lastTickAt - tvCache.prevTickAt) * 1000))
}

function publishTick() {
  if (!tvCache || tvCache.price <= 0) return
  const mark = buildTradovateMark()
  if (mark) TICK_LISTENERS.emit('tick', mark)
}

function applyTick(args: {
  price: number
  bid?: number | null
  ask?: number | null
  sourceTimeMs?: number
}) {
  if (!tvCache || !(args.price > 0)) return
  const now = Date.now()
  tvCache.prevTickAt = tvCache.lastTickAt || now
  tvCache.lastTickAt = now
  tvCache.updatedAt = now
  tvCache.sourceTimeMs = args.sourceTimeMs ?? now
  tvCache.price = args.price
  if (typeof args.bid === 'number') tvCache.bid = args.bid
  if (typeof args.ask === 'number') tvCache.ask = args.ask
  tvCache.status = 'live'
  tvCache.error = null
  tvCache.tickCount += 1
  // Morph forming 5m bar from live ticks when we have Tradovate candles
  morphFormingCandle(args.price, Math.floor((args.sourceTimeMs ?? now) / 1000))
  publishTick()
}

function morphFormingCandle(price: number, sourceSec: number) {
  if (!tvCache?.candles5m.length) return
  const BAR = 300
  const bucket = Math.floor(sourceSec / BAR) * BAR
  const bars = tvCache.candles5m
  let idx = bars.findIndex((c) => c.time === bucket)
  if (idx < 0) {
    const last = bars[bars.length - 1]
    if (bucket === last.time + BAR || bucket > last.time) {
      bars.push({
        time: bucket,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: 0,
        closeTime: bucket + BAR,
        forming: true,
      })
      idx = bars.length - 1
    } else {
      idx = bars.length - 1
    }
  }
  for (let i = 0; i < bars.length; i++) {
    if (i === idx) {
      bars[i] = {
        ...bars[i],
        close: price,
        high: Math.max(bars[i].high, bars[i].open, price),
        low: Math.min(bars[i].low, bars[i].open, price),
        forming: true,
      }
    } else if (bars[i].forming) {
      const { forming: _f, ...rest } = bars[i]
      bars[i] = rest
    }
  }
}

function parseQuoteFrame(frame: unknown, symbol: string) {
  const root = frame as {
    e?: string
    d?: unknown
    quotes?: unknown
  }
  const data = (root?.d ?? root) as {
    quotes?: Array<{
      entries?: Record<
        string,
        { price?: number; size?: number }
      >
    }>
  }
  const quotes = data?.quotes
  if (!Array.isArray(quotes)) return

  for (const q of quotes) {
    const e = q?.entries
    if (!e) continue
    const trade = e.Trade?.price ?? e.Last?.price ?? e.last?.price
    const bid = e.Bid?.price ?? e.bid?.price
    const ask = e.Offer?.price ?? e.Ask?.price ?? e.offer?.price
    if (typeof trade === 'number' && trade > 0) {
      applyTick({
        price: trade,
        bid: typeof bid === 'number' ? bid : null,
        ask: typeof ask === 'number' ? ask : null,
      })
    } else if (typeof bid === 'number' && typeof ask === 'number') {
      // Mid when trade hasn't printed yet
      applyTick({
        price: (bid + ask) / 2,
        bid,
        ask,
      })
    }
  }

  // Alternate nested map form: { entries: { NQZ6: { last } } }
  const alt = data as {
    entries?: Record<string, { last?: number; bid?: number; offer?: number }>
  }
  if (alt?.entries && typeof alt.entries === 'object') {
    const symQ = alt.entries[symbol] || Object.values(alt.entries)[0]
    if (symQ && typeof symQ.last === 'number') {
      applyTick({
        price: symQ.last,
        bid: symQ.bid ?? null,
        ask: symQ.offer ?? null,
      })
    }
  }
}

function parseTickCharts(frame: unknown) {
  const root = frame as { d?: { charts?: unknown[] }; charts?: unknown[] }
  const charts = (root?.d as { charts?: unknown[] })?.charts ?? root?.charts
  if (!Array.isArray(charts)) return

  for (const packet of charts) {
    const p = packet as {
      eoh?: boolean
      bp?: number
      bt?: number
      ts?: number
      tks?: Array<{
        t?: number
        p?: number
        b?: number
        a?: number
        bs?: number
        as?: number
      }>
      bars?: Array<{
        time?: number
        timestamp?: number
        open?: number
        high?: number
        low?: number
        close?: number
        upVolume?: number
        downVolume?: number
        volume?: number
        o?: number
        h?: number
        l?: number
        c?: number
      }>
    }
    if (p.eoh) continue

    if (p.tks?.length && typeof p.bp === 'number' && typeof p.ts === 'number') {
      for (const tick of p.tks) {
        if (typeof tick.p !== 'number') continue
        const price = (p.bp + tick.p) * p.ts
        const bid =
          typeof tick.b === 'number' && tick.bs
            ? (p.bp + tick.b) * p.ts
            : null
        const ask =
          typeof tick.a === 'number' && tick.as
            ? (p.bp + tick.a) * p.ts
            : null
        const tsMs =
          typeof p.bt === 'number' && typeof tick.t === 'number'
            ? p.bt + tick.t
            : Date.now()
        applyTick({ price, bid, ask, sourceTimeMs: tsMs })
      }
    }

    // Minute / 5m bars (Tradovate chart packets)
    if (p.bars?.length && tvCache) {
      const mapped: Candle[] = []
      for (const b of p.bars) {
        const open = b.open ?? b.o
        const high = b.high ?? b.h
        const low = b.low ?? b.l
        const close = b.close ?? b.c
        const rawT = b.time ?? b.timestamp
        if (
          open == null ||
          high == null ||
          low == null ||
          close == null ||
          rawT == null
        ) {
          continue
        }
        // Tradovate bar times are often ms
        const timeSec = rawT > 1e12 ? Math.floor(rawT / 1000) : rawT
        const openAlign = Math.floor(timeSec / 300) * 300
        mapped.push({
          time: openAlign,
          open,
          high,
          low,
          close,
          volume: b.volume ?? (b.upVolume ?? 0) + (b.downVolume ?? 0),
          closeTime: openAlign + 300,
        })
      }
      if (mapped.length) {
        // Merge into cache by open time
        const by = new Map(tvCache.candles5m.map((c) => [c.time, c]))
        for (const c of mapped) by.set(c.time, c)
        tvCache.candles5m = [...by.values()].sort((a, b) => a.time - b.time)
      }
    }
  }
}

function send(ws: WebSocket, endpoint: string, body?: unknown) {
  const id = reqId++
  const payload = body === undefined ? '' : JSON.stringify(body)
  ws.send(`${endpoint}\n${id}\n\n${payload}`)
  return id
}

async function connectTradovate(creds: TradovateCreds) {
  const urls = authUrls(creds.env)
  if (tvCache) {
    tvCache.status = 'auth'
    tvCache.error = null
  }

  const authBody: Record<string, string | number | boolean> = {
    name: creds.name,
    password: creds.password,
    appId: creds.appId,
    appVersion: creds.appVersion,
    'p-ticket': '',
  }
  if (creds.cid) authBody.cid = Number(creds.cid) || creds.cid
  if (creds.sec) authBody.sec = creds.sec

  const authRes = await fetch(urls.auth, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(authBody),
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
  if (tvWs) {
    try {
      tvWs.removeAllListeners()
      tvWs.close()
    } catch {
      /* ignore */
    }
  }

  const ws = new WebSocket(urls.md)
  tvWs = ws
  let authorized = false

  ws.on('open', () => {
    // Wait for 'o' open frame before authorize (handled in message)
  })

  ws.on('message', (buf) => {
    const raw = buf.toString()
    if (raw === 'o') {
      // Socket open — authorize with MD token
      ws.send(`authorize\n${reqId++}\n\n${token}`)
      return
    }
    if (raw === 'h' || raw === '[]') return

    let payload: unknown
    try {
      if (raw.startsWith('a')) payload = JSON.parse(raw.slice(1))
      else payload = JSON.parse(raw)
    } catch {
      return
    }

    const frames = Array.isArray(payload) ? payload : [payload]
    for (const frame of frames) {
      const f = frame as {
        i?: number
        s?: number
        e?: string
        d?: unknown
        quotes?: unknown
        charts?: unknown
      }

      // Authorize OK
      if (!authorized && f.s === 200) {
        authorized = true
        if (tvCache) {
          tvCache.status = 'connecting'
          tvCache.error = null
        }
        // 1) Quote stream (bid/ask/last)
        send(ws, 'md/subscribeQuote', { symbol: creds.symbol })
        // 2) Tick stream — every trade print as it hits Tradovate MD
        send(ws, 'md/getChart', {
          symbol: creds.symbol,
          chartDescription: {
            underlyingType: 'Tick',
            elementSize: 1,
            elementSizeUnit: 'UnderlyingUnits',
            withHistogram: false,
          },
          timeRange: { asMuchAsElements: 20 },
        })
        // 3) 5-minute bars from Tradovate (not Yahoo / TradingView)
        send(ws, 'md/getChart', {
          symbol: creds.symbol,
          chartDescription: {
            underlyingType: 'MinuteBar',
            elementSize: 5,
            elementSizeUnit: 'UnderlyingUnits',
            withHistogram: false,
          },
          timeRange: { asMuchAsElements: 250 },
        })
        continue
      }

      if (typeof f.s === 'number' && f.s >= 400) {
        if (tvCache) {
          tvCache.status = 'error'
          tvCache.error = `Tradovate MD error ${f.s}: ${JSON.stringify(f.d ?? f).slice(0, 200)}`
        }
        continue
      }

      if (f.e === 'md' || f.quotes || (f.d && typeof f.d === 'object')) {
        parseQuoteFrame(f, creds.symbol)
        parseTickCharts(f)
      }
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
    scheduleReconnect(creds)
  })

  if (tvHeartbeat) clearInterval(tvHeartbeat)
  tvHeartbeat = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.send('[]')
  }, 2500)
}

function scheduleReconnect(creds: TradovateCreds) {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    tvStarted = false
    void startTradovateFeed(creds)
  }, 3000)
}

async function startTradovateFeed(creds: TradovateCreds) {
  if (tvStarted) return
  tvStarted = true
  if (!tvCache) {
    tvCache = {
      price: 0,
      bid: null,
      ask: null,
      sourceTimeMs: 0,
      updatedAt: 0,
      lastTickAt: 0,
      prevTickAt: 0,
      symbol: creds.symbol,
      status: 'connecting',
      error: null,
      previousClose: null,
      candles5m: [],
      tickCount: 0,
    }
  } else {
    tvCache.status = 'connecting'
    tvCache.symbol = creds.symbol
  }

  try {
    await connectTradovate(creds)
  } catch (err) {
    if (tvCache) {
      tvCache.status = 'error'
      tvCache.error = err instanceof Error ? err.message : 'Tradovate start failed'
    }
    tvStarted = false
    scheduleReconnect(creds)
  }
}

function buildTradovateMark(): (MarkPrint & { tradovateConfigured: boolean }) | null {
  if (!tvCache || tvCache.price <= 0 || !tvCache.updatedAt) return null
  const ageSeconds = Math.max(0, (Date.now() - tvCache.updatedAt) / 1000)
  const previousClose = tvCache.previousClose
  const change =
    previousClose != null ? tvCache.price - previousClose : null
  const changePercent =
    change != null && previousClose ? (change / previousClose) * 100 : null
  const creds = hasTradovateCreds()
  return {
    symbol: tvCache.symbol,
    price: tvCache.price,
    sourceTime: Math.floor(tvCache.sourceTimeMs / 1000) || Math.floor(tvCache.updatedAt / 1000),
    fetchedAt: Date.now(),
    ageSeconds: Math.round(ageSeconds * 1000) / 1000,
    tickGapUs: tickGapUs(),
    freshness: freshnessFromAge(ageSeconds, 'rt'),
    source: `Tradovate MD tick stream (${creds?.env ?? 'demo'})`,
    previousClose,
    change,
    changePercent,
    bid: tvCache.bid,
    ask: tvCache.ask,
    note: `Tick #${tvCache.tickCount} from Tradovate — not TradingView, not Yahoo. Gap between last ticks: ${tickGapUs() ?? '—'} µs.`,
    tradovateConfigured: true,
    tradovateStatus: tvCache.status,
    feedMode: 'tradovate-tick',
  }
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
    tickGapUs: null,
    freshness: freshnessFromAge(ageSeconds, 'delayed'),
    source: 'Yahoo Finance delayed (NOT Tradovate, NOT TradingView)',
    previousClose,
    change,
    changePercent,
    bid: null,
    ask: null,
    note:
      'Fallback only. Add Tradovate API credentials for tick-stream LIVE prices from the Tradovate platform.',
    feedMode: 'yahoo-delayed',
  }
}

export function tradovateStatus() {
  const creds = hasTradovateCreds()
  return {
    configured: Boolean(creds),
    cache: tvCache
      ? {
          status: tvCache.status,
          symbol: tvCache.symbol,
          price: tvCache.price,
          tickCount: tvCache.tickCount,
          updatedAt: tvCache.updatedAt,
          error: tvCache.error,
          candles: tvCache.candles5m.length,
          tickGapUs: tickGapUs(),
        }
      : null,
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
    missing: {
      name: !process.env.TRADOVATE_NAME?.trim(),
      password: !process.env.TRADOVATE_PASSWORD?.trim(),
      cid: !process.env.TRADOVATE_CID?.trim(),
      sec: !process.env.TRADOVATE_SEC?.trim(),
    },
    note:
      'Tradovate ticks need API Access: generate an API key (cid + sec) and use its dedicated API password (not only the Trader login). CME MD entitlement required for quotes.',
  }
}

export function getTradovateCandles(): Candle[] | null {
  if (!tvCache?.candles5m.length) return null
  if (tvCache.status !== 'live' && tvCache.price <= 0) return null
  return tvCache.candles5m
}

export function onTick(listener: (mark: MarkPrint) => void): () => void {
  TICK_LISTENERS.on('tick', listener)
  return () => {
    TICK_LISTENERS.off('tick', listener)
  }
}

export async function getBestMark(): Promise<MarkPrint & { tradovateConfigured: boolean }> {
  const creds = hasTradovateCreds()
  if (creds) {
    void startTradovateFeed(creds)
  }

  const live = buildTradovateMark()
  if (live && live.freshness === 'live') {
    return live
  }

  const yahoo = await fetchYahooMark('NQZ26.CME')
  return {
    ...yahoo,
    tradovateConfigured: Boolean(creds),
    tradovateStatus: tvCache?.status ?? (creds ? 'connecting' : 'idle'),
    note: creds
      ? `Tradovate credentials present but no fresh tick yet (${tvCache?.status ?? 'idle'}${tvCache?.error ? `: ${tvCache.error}` : ''}). Showing delayed Yahoo — never inventing live prices. Not TradingView.`
      : 'No Tradovate credentials in .env — cannot stream Tradovate platform prices. Showing delayed Yahoo only (not TradingView).',
  }
}

/** Ensure feed starts at server boot when creds exist. */
export function ensureTradovateBoot() {
  const creds = hasTradovateCreds()
  if (creds) void startTradovateFeed(creds)
}
