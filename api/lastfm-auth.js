// Serverless proxy: /api/lastfm-auth → https://ws.audioscrobbler.com/2.0/ (POST, signed)
// Handles authenticated write calls: builds api_sig with MD5, forwards to Last.fm
// Replaces Vite dev proxy middleware

import crypto from 'node:crypto'

// Read request body (Vercel Node.js runtime doesn't auto-parse)
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Content-Type', 'application/json')

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const body = await readBody(req)
    const params = new URLSearchParams(body)
    const apiSecret = params.get('api_secret')

    if (!apiSecret) {
      res.status(400).json({ error: 'Missing api_secret' })
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
    res.status(response.status).json(data)
  } catch (err) {
    res.status(502).json({ error: `Auth proxy error: ${err.message}` })
  }
}
