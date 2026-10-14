import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { config as loadEnv } from 'dotenv'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'
import { getBestMark, tradovateStatus } from './server/markFeed.ts'

loadEnv()

function markApiPlugin(): Plugin {
  return {
    name: 'nqz6-mark-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url) return next()
        if (req.url.startsWith('/api/mark')) {
          try {
            const mark = await getBestMark()
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
        if (req.url.startsWith('/api/tradovate-status')) {
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store')
          res.end(JSON.stringify(tradovateStatus()))
          return
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), markApiPlugin()],
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
