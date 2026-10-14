import { json } from './_yahoo.mjs'

export async function handler() {
  return json({
    configured: Boolean(
      process.env.TRADOVATE_NAME && process.env.TRADOVATE_PASSWORD,
    ),
    cache: null,
    platform: 'netlify',
    missing: {
      name: !process.env.TRADOVATE_NAME,
      password: !process.env.TRADOVATE_PASSWORD,
      cid: !process.env.TRADOVATE_CID,
      sec: !process.env.TRADOVATE_SEC,
    },
    note: 'Netlify hosts the static UI + Yahoo mark API. Tradovate tick WebSocket only runs with local `npm run dev`.',
  })
}
