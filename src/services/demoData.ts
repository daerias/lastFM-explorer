// Demo data for screenshots and first-time users.
// All data is static — no API calls needed.

export interface DemoArtist { name: string; plays: number }
export interface DemoTrack { name: string; artist: string; plays: number }
export interface DemoTag { name: string; count: number }
export interface DemoDayBucket { date: string; label: string; count: number }

export const DEMO_USERNAME = 'daerias'

export const DEMO_STATS = {
  totalScrobbles: 148_237,
  topArtistPlays: 4_821,
  memberSince: new Date('2010-03-14'),
}

export const DEMO_TOP_ARTISTS: DemoArtist[] = [
  { name: 'Pendulum', plays: 4821 },
  { name: 'Noisia', plays: 3892 },
  { name: 'Camo & Krooked', plays: 3401 },
  { name: 'The Prodigy', plays: 2987 },
  { name: 'Mefjus', plays: 2654 },
  { name: 'Sub Focus', plays: 2431 },
  { name: 'Chase & Status', plays: 2210 },
  { name: 'Netsky', plays: 1893 },
  { name: 'Black Sun Empire', plays: 1678 },
  { name: 'High Contrast', plays: 1502 },
]

export const DEMO_TOP_TRACK: DemoTrack = {
  name: 'Witchcraft',
  artist: 'Pendulum',
  plays: 487,
}

export const DEMO_TOP_TAGS: DemoTag[] = [
  { name: 'dnb', count: 4230 },
  { name: 'power', count: 3187 },
  { name: 'neurofunk', count: 2891 },
  { name: 'liquid', count: 2456 },
  { name: 'female-vocals', count: 2012 },
  { name: 'workout', count: 1876 },
  { name: 'favorite', count: 1654 },
  { name: 'banger', count: 1432 },
  { name: 'night-drive', count: 1298 },
  { name: 'chill', count: 1105 },
]

export const DEMO_TOP_GENRES: DemoTag[] = [
  { name: 'drum and bass', count: 2845 },
  { name: 'electronic', count: 2340 },
  { name: 'neurofunk', count: 1892 },
  { name: 'liquid funk', count: 1654 },
  { name: 'breakbeat', count: 1230 },
  { name: 'techno', count: 987 },
  { name: 'ambient', count: 845 },
  { name: 'dubstep', count: 723 },
  { name: 'jungle', count: 610 },
  { name: 'psytrance', count: 498 },
]

export const DEMO_ALL_TAGS: DemoTag[] = [
  { name: 'dnb', count: 4230 },
  { name: 'power', count: 3187 },
  { name: 'neurofunk', count: 2891 },
  { name: 'liquid', count: 2456 },
  { name: 'female-vocals', count: 2012 },
  { name: 'workout', count: 1876 },
  { name: 'favorite', count: 1654 },
  { name: 'banger', count: 1432 },
  { name: 'night-drive', count: 1298 },
  { name: 'chill', count: 1105 },
  { name: '4s', count: 980 },
  { name: '5s', count: 856 },
  { name: 'deep', count: 743 },
  { name: 'atmospheric', count: 689 },
  { name: 'aggressive', count: 621 },
  { name: 'melodic', count: 554 },
  { name: 'rollers', count: 487 },
  { name: 'techstep', count: 412 },
  { name: 'dancefloor', count: 398 },
  { name: 'minimal', count: 345 },
  { name: 'jump-up', count: 312 },
  { name: 'halftime', count: 278 },
  { name: 'dark', count: 256 },
  { name: 'summer', count: 234 },
  { name: 'vocal', count: 198 },
]

// Past 14 days of listening data
function generateDemoDays(): DemoDayBucket[] {
  const days: DemoDayBucket[] = []
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const baseCounts = [85, 62, 110, 45, 130, 95, 72, 88, 140, 55, 105, 78, 120, 67]

  const now = new Date()
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().slice(0, 10)
    const dayOfWeek = d.getDay()
    days.push({
      date: dateStr,
      label: labels[dayOfWeek === 0 ? 6 : dayOfWeek - 1],
      count: baseCounts[13 - i] + Math.floor(Math.random() * 30 - 15),
    })
  }
  return days
}

export const DEMO_CHART_DAYS = generateDemoDays()

export const DEMO_TRACKS: DemoTrack[] = [
  { name: 'Witchcraft', artist: 'Pendulum', plays: 487 },
  { name: 'Stigma', artist: 'Noisia', plays: 423 },
  { name: 'Solar System', artist: 'Sub Focus', plays: 398 },
  { name: 'Afterglow', artist: 'Wilkinson', plays: 367 },
  { name: 'Breathe', artist: 'Camo & Krooked', plays: 345 },
  { name: 'Dustup', artist: 'Noisia & The Upbeats', plays: 334 },
  { name: 'Sientelo', artist: 'Mefjus', plays: 312 },
  { name: 'Program', artist: 'Chase & Status', plays: 298 },
  { name: 'Watercolour', artist: 'Pendulum', plays: 287 },
  { name: 'Arrakis', artist: 'Black Sun Empire', plays: 276 },
]

// Demo timeline entries for Library page (Track-shaped objects)
export interface DemoTimelineEntry {
  artist: { '#text': string }
  name: string
  date: { uts: string }
  image: { '#text': string; size: string }[]
  album?: { '#text': string }
  url: string
}

export function generateDemoTimeline(): DemoTimelineEntry[] {
  const artists = ['Pendulum', 'Noisia', 'Camo & Krooked', 'Sub Focus', 'Mefjus', 'The Prodigy', 'Black Sun Empire', 'Netsky', 'High Contrast', 'Chase & Status']
  const tracks = [
    'Witchcraft', 'Stigma', 'Solar System', 'Afterglow', 'Breathe', 'Dustup', 'Sientelo', 'Program',
    'Watercolour', 'Arrakis', 'Voodoo People', 'Blood Sugar', 'No Problem', 'Desire', 'Goddess',
    'Tap Ho', 'Dead Limit', 'Stompbox', 'Ritual', 'Mr Happy', 'Elevate This Sound', 'Deep Space',
  ]
  const albums = ['Hold Your Colour', 'Split the Atom', 'Mosaik', 'Torus', 'Emulation', 'Invaders Must Die', 'Lights and Wires', '3', 'Tough Guys', 'More Than Alot']
  
  const entries: DemoTimelineEntry[] = []
  const now = Date.now()
  
  for (let i = 0; i < 20; i++) {
    const minsAgo = i * 45 + Math.floor(Math.random() * 60)
    const ts = Math.floor((now - minsAgo * 60000) / 1000)
    const artist = artists[i % artists.length]
    const track = tracks[i % tracks.length]
    
    entries.push({
      artist: { '#text': artist },
      name: track,
      date: { uts: String(ts) },
      image: [{ '#text': '', size: 'small' }],
      album: { '#text': albums[i % albums.length] },
      url: `https://www.last.fm/music/${encodeURIComponent(artist)}/_/${encodeURIComponent(track)}`,
    })
  }
  return entries
}
