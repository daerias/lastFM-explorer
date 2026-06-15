// Serverless proxy: /api/auth/session → https://ws.audioscrobbler.com/2.0/
// Exchanges a Last.fm OAuth token for a session key
// Replaces Vite dev proxy middleware

import crypto from 'node:crypto'

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Content-Type', 'application/json')

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host}`)
    const token = url.searchParams.get('token')
    const apiKey = url.searchParams.get('api_key')
    const apiSecret = url.searchParams.get('api_secret')

    if (!token) {
      res.status(400).json({ error: 'Missing token parameter' })
      return
    }

    if (!apiKey || !apiSecret) {
      res.status(400).json({ error: 'Missing API credentials. Add them in Settings first.' })
      return
    }

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
    res.status(response.status).json(data)
  } catch (err) {
    res.status(502).json({ error: `Failed to reach Last.fm: ${err.message}` })
  }
}
