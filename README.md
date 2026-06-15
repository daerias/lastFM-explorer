# 🔊 Last.fm Explorer

> **Your listening history, reimagined.** A dark-themed neuromorphic dashboard for Last.fm — discover patterns, manage tags, and explore your music data through a stunning cyberpunk interface.

<p align="center">
  <img src="https://img.shields.io/badge/Last.fm-D51007?logo=last.fm&logoColor=white" alt="Last.fm">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react" alt="React 19">
  <img src="https://img.shields.io/badge/Vite-6-646CFF?logo=vite" alt="Vite 6">
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript" alt="TypeScript 5.7">
  <img src="https://img.shields.io/badge/license-proprietary-blue" alt="License">
</p>

<p align="center">
  <img src="screenshots/home.png" alt="Home Dashboard" width="800">
</p>

<p align="center">
  <em>The Home dashboard — interactive listening charts, stat cards, compare mode, and top artists. All wrapped in a dark neuromorphic design with neon accents.</em>
</p>

---

## ✨ Features

### 📊 Deep Listening Analytics
- **Interactive charts** — day / week / month aggregation with multi-filter system
- **Calendar heatmap** — GitHub-style grid of your listening density
- **Compare mode** — overlay two date ranges to see how your taste evolves
- **Top artists & tracks** with period selectors (7d / 1m / 3m / 6m / 1y / all)

### 📚 Library Browser
- **Live timeline** — recent scrobbles with relative timestamps
- **Multi-tag filtering** — intersect your personal Last.fm tags
- **Artist detail panel** — bio, stats, top tracks in a slide-over
- **Full-text search** across all scrobbled tracks

<p align="center">
  <img src="screenshots/library.png" alt="Library Browser" width="800">
</p>

### 🏷️ Tag Management
- **Chip cloud** — browse hundreds of tags grouped by letter
- **Rename & delete** tags globally across all tracks
- **Tag exploration** — click any tag to see every tagged track
- **Regex search** for power users

<p align="center">
  <img src="screenshots/tags.png" alt="Tag Management" width="800">
</p>

### 🎵 Music Playback
- **Auto-detect free sources** — Deezer widget with YouTube fallback
- **Slide-out player** — page stays fully interactive while music plays
- **Now Playing** — dancing equalizer bars + track info in sidebar

### 🎨 Visual Design System
- **10 curated themes** — Dark, Light, EDM, Ocean, Forest, Sunset, Midnight, Toxic, Cherry, Mono
- **Neuromorphic UI** — multi-layer shadows, glass effects, neon edge glows
- **Atmospheric effects** — noise, scanlines, chromatic aberration, vignette, particles
- **3D depth system** — realistic perspective with `translateZ()`
- **Cinematic LUTs** — 8 color grading presets (Teal & Orange, Noir, Cyberpunk, Wes Anderson…)
- **7 icon styles** — Neon, Glass, Minimal, Brutal, Retro, Sketch, Chrome

<p align="center">
  <img src="screenshots/settings.png" alt="Theme Settings" width="800">
</p>

---

## 🚀 Quick Start

```bash
npm install
npm run dev        # → http://localhost:5173
```

### Last.fm Setup

Open the app → **Settings** → enter your [Last.fm API Key](https://www.last.fm/api) and Shared Secret.
Credentials stay in your browser's localStorage — nothing leaves your machine.

### Production Build

```bash
npm run build      # → dist/
```

Deploy the `dist/` folder to Vercel, Netlify, or any static host.

---

## 🛠️ Tech Stack

| Technology | Purpose |
|------------|---------|
| React 19 | UI framework |
| TypeScript 5.7 | Type safety (strict mode) |
| Vite 6 | Build tool + dev server with API proxies |
| React Router 7 | Client-side routing |
| CSS Modules | Scoped component styles |
| Last.fm API v2.0 | Music data + OAuth |

**Zero UI libraries. Zero CSS frameworks.** Every pixel is custom CSS.

---

## 🏗️ Architecture

```
src/
├── main.tsx              # Entry — theme applied before first render
├── App.tsx               # Routes + context providers
├── components/
│   ├── Layout/           # Floating sidebar dock + app shell
│   └── shared/           # Charts, cards, panels, player, tag chips
├── context/              # AuthContext, MusicPlayerContext
├── hooks/                # useCoverFallback, useAudioReactiveLava, useMicrophoneReactivity
├── pages/                # Home, Library, Tags, Settings, DayDetail
├── services/             # Last.fm client, cover art search, free music source finder
├── store/                # Theme, icon style, cinematic LUTs, credentials (localStorage)
└── styles/               # Design system (theme.css) + icon system (neuro-icons.css)
```

| Route | Page |
|-------|------|
| `/` | **Home** — listening charts, compare mode, top artists |
| `/library` | **Library** — timeline, tag filter, top artists & tracks |
| `/tags` | **Tags** — manage, rename, delete, explore |
| `/settings` | **Settings** — credentials, themes, effects, audio reactivity |
| `/day/:date` | **Day Detail** — single day's scrobbles |

---

## 📄 License

© 2025–2026 Darius Schindler. All rights reserved.

Personal use is free. Commercial use, redistribution, or public hosting requires permission. See [LICENSE](LICENSE).
