import { fetchYahooMark } from './_yahoo.mjs'

/**
 * Short SSE burst for Netlify (functions are not long-lived sockets).
 * Client falls back to polling /api/mark when the stream ends.
 */
export async function handler() {
  try {
    const mark = await fetchYahooMark()
    const status = {
      configured: Boolean(
        process.env.TRADOVATE_NAME && process.env.TRADOVATE_PASSWORD,
      ),
      cache: { status: 'netlify', tickGapUs: null, error: null },
      platform: 'netlify',
    }
    const body =
      `: netlify-mark-stream\n\n` +
      `event: mark\ndata: ${JSON.stringify(mark)}\n\n` +
      `event: status\ndata: ${JSON.stringify(status)}\n\n`

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Access-Control-Allow-Origin': '*',
      },
      body,
    }
  } catch (err) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: err instanceof Error ? err.message : 'ticks failed',
      }),
    }
  }
}
