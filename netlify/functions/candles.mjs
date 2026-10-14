import { json } from './_yahoo.mjs'

/** Tradovate 5m bars are not available on Netlify (no persistent WS). */
export async function handler() {
  return {
    statusCode: 204,
    headers: { 'Cache-Control': 'no-store' },
    body: '',
  }
}
