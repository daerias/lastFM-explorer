// Serverless proxy: /api/youtube-search?q=ARTIST+TRACK
// Fetches YouTube search results HTML and extracts video IDs from ytInitialData.
// No API key needed — parses the embedded JSON on the search page.

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
    const query = url.searchParams.get('q')
    if (!query) {
      res.status(400).json({ error: 'Missing q param' })
      return
    }

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
    const videoIds = []
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

    res.status(200).json({ videoIds, query })
  } catch (err) {
    res.status(502).json({ error: `YouTube search failed: ${err.message}`, videoIds: [] })
  }
}
