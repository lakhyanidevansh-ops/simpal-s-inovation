import { fetchYahooChart, json } from './_yahoo.mjs'

/**
 * Proxies Yahoo chart JSON.
 * Accepts either:
 *   /api/yahoo/v8/finance/chart/NQZ26.CME?interval=5m&range=5d
 *   /.netlify/functions/yahoo?interval=5m&range=5d
 */
export async function handler(event) {
  try {
    const qs = event.queryStringParameters || {}
    const interval = qs.interval || '5m'
    const range = qs.range || '5d'
    const data = await fetchYahooChart(interval, range)
    return json(data)
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : 'yahoo proxy failed' },
      502,
    )
  }
}
