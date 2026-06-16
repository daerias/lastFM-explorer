import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import crypto from 'node:crypto'

export default defineConfig(({ mode }) => {
  // .env fallback — credentials can also be provided via the GUI
  const env = loadEnv(mode, process.cwd(), '')
  const ENV_KEY = env.VITE_LASTFM_API_KEY
  const ENV_SECRET = env.LASTFM_API_SECRET

  return {
    plugins: [
    react(),
    {
      name: 'lastfm-auth-proxy',
      configureServer(server) {
        // Authenticated write proxy — signs requests with api_sig + api_secret
        server.middlewares.use('/api/lastfm-auth', async (req, res) => {
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Content-Type', 'application/json')
          if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return }

          let body = ''
          req.on('data', (chunk) => { body += chunk })
          req.on('end', async () => {
            try {
              const params = new URLSearchParams(body)
              const apiSecret = params.get('api_secret')
              if (!apiSecret) {
                // Try to get from stored credentials or .env
                res.statusCode = 400
                res.end(JSON.stringify({ error: 'Missing api_secret' }))
                return
              }
              params.delete('api_secret')

              // Build api_sig: sorted param keys concatenated + secret, MD5
              const sorted = Array.from(params.entries())
                .filter(([k]) => k !== 'api_sig' && k !== 'format')
                .sort(([a], [b]) => a.localeCompare(b))
              const sigRaw = sorted.map(([k, v]) => `${k}${v}`).join('') + apiSecret
              const apiSig = crypto.createHash('md5').update(sigRaw).digest('hex')
              params.set('api_sig', apiSig)
              params.set('format', 'json')

              const response = await fetch('https://ws.audioscrobbler.com/2.0/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params.toString(),
              })
              const data = await response.json()
              res.statusCode = response.status
              res.end(JSON.stringify(data))
            } catch (err: any) {
              res.statusCode = 502
              res.end(JSON.stringify({ error: `Auth proxy error: ${err.message}` }))
            }
          })
        })

        // iTunes API proxy — free, no auth needed, avoids CORS
        server.middlewares.use('/api/itunes', async (req, res) => {
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Content-Type', 'application/json')
          if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return }

          const url = new URL(req.url!, `http://${req.headers.host}`)
          const path = url.pathname.replace('/api/itunes', '')
          const query = url.searchParams.toString()
          const target = `https://itunes.apple.com${path}${query ? `?${query}` : ''}`

          try {
            const response = await fetch(target)
            const data = await response.json()
            res.statusCode = response.status
            res.end(JSON.stringify(data))
          } catch (err: any) {
            res.statusCode = 502
            res.end(JSON.stringify({ error: `iTunes API unreachable: ${err.message}` }))
          }
        })

        // Deezer API proxy — free, no auth needed, avoids CORS
        server.middlewares.use('/api/deezer', async (req, res) => {
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Content-Type', 'application/json')
          if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return }

          const url = new URL(req.url!, `http://${req.headers.host}`)
          const path = url.pathname.replace('/api/deezer', '')
          const query = url.searchParams.toString()
          const target = `https://api.deezer.com${path}${query ? `?${query}` : ''}`

          try {
            const response = await fetch(target)
            const data = await response.json()
            res.statusCode = response.status
            res.end(JSON.stringify(data))
          } catch (err: any) {
            res.statusCode = 502
            res.end(JSON.stringify({ error: `Deezer API unreachable: ${err.message}` }))
          }
        })

        // YouTube Search Proxy — extracts video IDs from YouTube search results HTML
        // No API key needed. Parses ytInitialData from the page.
        server.middlewares.use('/api/youtube-search', async (req, res) => {
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Content-Type', 'application/json')
          if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return }

          const url = new URL(req.url!, `http://${req.headers.host}`)
          const query = url.searchParams.get('q')
          if (!query) { res.statusCode = 400; res.end(JSON.stringify({ error: 'Missing q param' })); return }

          try {
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), 6000)
            const response = await fetch(
              `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
              {
                signal: controller.signal,
                headers: {
                  'Accept-Language': 'en-US,en;q=0.9',
                  'User-Agent': 'Mozilla/5.0 (compatible; lastfm-explorer/1.0)',
                },
              },
            )
            clearTimeout(timeout)
            const html = await response.text()

            // Extract video IDs from ytInitialData JSON embedded in the page.
            // Use brace counting to handle deeply nested JSON safely.
            const videoIds: string[] = []
            const prefix = 'ytInitialData = '
            const startIdx = html.indexOf(prefix)
            if (startIdx !== -1) {
              const jsonStart = html.indexOf('{', startIdx)
              if (jsonStart !== -1) {
                let depth = 0
                let jsonEnd = -1
                for (let i = jsonStart; i < html.length; i++) {
                  if (html[i] === '{') depth++
                  else if (html[i] === '}') { depth--; if (depth === 0) { jsonEnd = i; break } }
                }
                if (jsonEnd !== -1) {
                  try {
                    const data = JSON.parse(html.slice(jsonStart, jsonEnd + 1))
                    const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
                      ?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents ?? []
                    for (const item of contents) {
                      const vid = item?.videoRenderer?.videoId
                      if (vid && !videoIds.includes(vid)) videoIds.push(vid)
                    }
                  } catch { /* parsing failed — return empty */ }
                }
              }
            }

            res.statusCode = 200
            res.end(JSON.stringify({ videoIds, query }))
          } catch (err: any) {
            res.statusCode = 502
            res.end(JSON.stringify({ error: `YouTube search failed: ${err.message}`, videoIds: [] }))
          }
        })

        // Generic Last.fm API proxy — avoids CORS issues
        server.middlewares.use('/api/lastfm', async (req, res) => {
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Content-Type', 'application/json')
          if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return }

          const url = new URL(req.url!, `http://${req.headers.host}`)
          const query = url.searchParams.toString()

          try {
            const response = await fetch(`https://ws.audioscrobbler.com/2.0/?${query}`)
            const data = await response.json()
            res.statusCode = response.status
            res.end(JSON.stringify(data))
          } catch (err: any) {
            res.statusCode = 502
            res.end(JSON.stringify({ error: `Last.fm API unreachable: ${err.message}` }))
          }
        })

        // Proxy endpoint to exchange a Last.fm token for a session key.
        server.middlewares.use('/api/auth/session', async (req, res) => {
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Content-Type', 'application/json')

          if (req.method === 'OPTIONS') {
            res.statusCode = 204
            res.end()
            return
          }

          const url = new URL(req.url!, `http://${req.headers.host}`)
          const token = url.searchParams.get('token')
          let apiKey = url.searchParams.get('api_key')
          let apiSecret = url.searchParams.get('api_secret')

          // Fallback to .env if not provided in request
          if (!apiKey && ENV_KEY && ENV_KEY !== 'your_api_key_here') apiKey = ENV_KEY
          if (!apiSecret && ENV_SECRET) apiSecret = ENV_SECRET

          if (!token) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'Missing token parameter' }))
            return
          }

          if (!apiKey || !apiSecret) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'Missing API credentials. Add them in Settings first.' }))
            return
          }

          try {
            const params = new URLSearchParams({
              method: 'auth.getSession',
              api_key: apiKey,
              token,
            })

            // Build the api_sig
            const sigRaw =
              Array.from(params.entries())
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([k, v]) => `${k}${v}`)
                .join('') + apiSecret

            const apiSig = crypto.createHash('md5').update(sigRaw).digest('hex')
            params.append('api_sig', apiSig)
            params.append('format', 'json')

            const response = await fetch('https://ws.audioscrobbler.com/2.0/', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: params.toString(),
            })

            const data = await response.json()
            res.statusCode = response.status
            res.end(JSON.stringify(data))
          } catch (err: any) {
            res.statusCode = 502
            res.end(JSON.stringify({ error: `Failed to reach Last.fm: ${err.message}` }))
          }
        })
      },
    },
  ],
  }
})
