// Serverless proxy: /api/deezer → https://api.deezer.com
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
    const url = new URL(req.url, `http://${req.headers.host}`)
    const path = url.pathname.replace('/api/deezer', '')
    const query = url.searchParams.toString()
    const target = `https://api.deezer.com${path}${query ? `?${query}` : ''}`

    const response = await fetch(target)
    const data = await response.json()
    res.status(response.status).json(data)
  } catch (err) {
    res.status(502).json({ error: `Deezer API unreachable: ${err.message}` })
  }
}
