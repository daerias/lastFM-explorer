// Serverless proxy: /api/lastfm → https://ws.audioscrobbler.com/2.0/
// Avoids CORS issues in production (replaces Vite dev proxy)

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
    const query = new URL(req.url, `http://${req.headers.host}`).searchParams.toString()
    const response = await fetch(`https://ws.audioscrobbler.com/2.0/?${query}`)
    const data = await response.json()
    res.status(response.status).json(data)
  } catch (err) {
    res.status(502).json({ error: `Last.fm API unreachable: ${err.message}` })
  }
}
