import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { config as loadEnv } from 'dotenv'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'

loadEnv()

/**
 * Dev-only API middleware. Dynamically imports the Tradovate feed so
 * `vite build` / Netlify never boots WebSockets during config evaluation
 * (that hung production builds and produced blank deploys).
 */
function markApiPlugin(): Plugin {
  return {
    name: 'nqz6-mark-api',
    apply: 'serve',
    async configureServer(server) {
      const feed = await import('./server/markFeed.ts')
      feed.ensureTradovateBoot()

      server.middlewares.use(async (req, res, next) => {
        if (!req.url) return next()

        if (req.url.startsWith('/api/ticks')) {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
          })
          res.write(`: tradovate-tick-stream\n\n`)

          void feed.getBestMark().then((mark) => {
            res.write(`event: mark\ndata: ${JSON.stringify(mark)}\n\n`)
          })

          const unsub = feed.onTick((mark) => {
            res.write(`event: mark\ndata: ${JSON.stringify(mark)}\n\n`)
          })

          const pulse = setInterval(() => {
            res.write(
              `event: status\ndata: ${JSON.stringify(feed.tradovateStatus())}\n\n`,
            )
          }, 250)

          req.on('close', () => {
            clearInterval(pulse)
            unsub()
          })
          return
        }

        if (req.url.startsWith('/api/mark')) {
          try {
            const mark = await feed.getBestMark()
            res.setHeader('Content-Type', 'application/json')
            res.setHeader('Cache-Control', 'no-store')
            res.end(JSON.stringify(mark))
          } catch (err) {
            res.statusCode = 502
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({
                error: err instanceof Error ? err.message : 'mark failed',
              }),
            )
          }
          return
        }

        if (req.url.startsWith('/api/candles')) {
          try {
            const tv = feed.getTradovateCandles()
            if (tv?.length) {
              res.setHeader('Content-Type', 'application/json')
              res.setHeader('Cache-Control', 'no-store')
              res.end(JSON.stringify({ source: 'tradovate', candles: tv }))
              return
            }
            res.statusCode = 204
            res.end()
          } catch (err) {
            res.statusCode = 502
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({
                error: err instanceof Error ? err.message : 'candles failed',
              }),
            )
          }
          return
        }

        if (req.url.startsWith('/api/tradovate-status')) {
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store')
          res.end(JSON.stringify(feed.tradovateStatus()))
          return
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), markApiPlugin()],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    host: '0.0.0.0',
    port: 4317,
    strictPort: true,
    proxy: {
      '/api/yahoo': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/yahoo/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader(
              'User-Agent',
              'Mozilla/5.0 (compatible; NQZ6Live/1.0)',
            )
            proxyReq.setHeader('Accept', 'application/json')
          })
        },
      },
    },
  },
})
