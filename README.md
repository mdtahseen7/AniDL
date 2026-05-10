# Tokyo Downloader API

A simple API that fetches anime download links from Tokyo Insider. Built with Cloudflare Workers - runs on the edge, no server needed.

## What This Does

You give it an anime name (or ID) and it spits back download links. That's it. No scraping scripts, no local setup, just HTTP requests.

## Quick Start

```bash
cd worker
npm install
npm run dev
```

To deploy:
```bash
npm run deploy
```

## The API

### Search for Anime

```
GET /api/search?q=Naruto
```

Returns a list of matching anime with their IDs.

**Example:**
```bash
curl "https://your-worker.workers.dev/api/search?q=Bleach"
```

**Response:**
```json
{
  "results": [
    {"id": "/anime/B/Bleach_(TV)", "title": "Bleach (TV)", "types": {}},
    {"id": "/anime/B/Bleach:_Memories_of_Nobody_(Movie)", "title": "Bleach: Memories of Nobody (Movie)", "types": {}}
  ]
}
```

---

### Get Anime Details

```
GET /api/anime?id=/anime/B/Bleach_(TV)
```

Get episode counts for each type (episode, ova, special, movie).

**Example:**
```bash
curl "https://your-worker.workers.dev/api/anime?id=/anime/B/Bleach_(TV)"
```

**Response:**
```json
{
  "id": "/anime/B/Bleach_(TV)",
  "title": "Bleach",
  "types": {
    "episode": 406,
    "ova": 3,
    "special": 6,
    "movie": 4
  }
}
```

---

### Get Download Links (Main Stuff)

```
GET /api/download?id=<anime_id>&sort=<option>&episodes=<range>&template=<template>
```

This is where the magic happens. Pass in the anime ID and get actual download URLs.

**Parameters:**

| Parameter | What it does | Default |
|-----------|--------------|---------|
| `id` | Anime ID from search results | required |
| `sort` | How to pick the best link | `most_downloaded` |
| `episodes` | Which episodes to fetch (e.g. `1-10`) | all of them |
| `template` | Custom filename format | none |

**Sort options:**
- `most_downloaded` - Most popular file (default)
- `least_downloaded` - Least popular
- `biggest` - Largest file size
- `smallest` - Smallest file size
- `latest` - Recently added
- `oldest` - Oldest files first

**Example:**
```bash
curl "https://your-worker.workers.dev/api/download?id=/anime/B/Bleach_(TV)&sort=most_downloaded&episodes=1-2"
```

**Response:**
```json
{
  "title": "Bleach",
  "anime_id": "/anime/B/Bleach_(TV)",
  "downloads": [
    {
      "link": "https://media.tokyoinsider.com:8080/dl/00000000030/864/1/bx_KMMCSnSEgHyCGzA2eTw/m/8/86/864/864/%5BLunar%5D%20Bleach%20-%2001%20%5B2101CD82%5D.avi",
      "episode": "1",
      "type": "episode",
      "size": "130.82 MB",
      "downloads": 11557,
      "uploader": "Anonymous",
      "date": "3/5/2010",
      "status": "Success"
    },
    {
      "link": "https://media.tokyoinsider.com:8080/dl/00000000030/63990/1/jt3mNhSz0WqHcn04BaYikQ/m/6/63/63990/63990/BLEACH-OVA_1-HD-XOL_TEAM-ANIMEIAT.COM.mp4",
      "episode": "1",
      "type": "ova",
      "size": "198.00 MB",
      "downloads": 322,
      "uploader": "sifsif",
      "date": "20/9/2011",
      "status": "Success"
    },
    {
      "link": "https://media.tokyoinsider.com:8080/dl/00000000030/9882/1/V_MpBmJZ1bBYpHIWAn8MJQ/m/9/98/9882/9882/%5BBP-MKV%5D%5BAnime-Keep_ANBU%5D_Bleach_02_%5B180101DA%5D.mkv",
      "episode": "2",
      "type": "episode",
      "size": "50.29 MB",
      "downloads": 2265,
      "uploader": "klayf",
      "date": "2/6/2010",
      "status": "Success"
    },
    {
      "link": "https://media.tokyoinsider.com:8080/dl/00000000030/63771/1/ZF0Z-QXincMNgC_K-mqlFw/m/6/63/63771/63771/Bleach%20OVA%202%20-%20XOL%20-%20Team%20-%20%20HD%20-%20animeiat.mp4",
      "episode": "2",
      "type": "ova",
      "size": "200.02 MB",
      "downloads": 384,
      "uploader": "sifsif",
      "date": "13/9/2011",
      "status": "Success"
    }
  ],
  "total": 4
}
```

---

### Health Check

```
GET /health
```

Just checks if the worker is alive.

**Response:**
```json
{"status": "ok"}
```

---

## Real World Usage

Since this is just a simple REST API, you can use it anywhere:

### JavaScript/Node.js
```javascript
const response = await fetch('https://your-worker.workers.dev/api/download?id=/anime/N/Naruto&sort=latest&episodes=1-5');
const data = await response.json();
data.downloads.forEach(dl => console.log(dl.link));
```

### Python
```python
import requests
r = requests.get('https://your-worker.workers.dev/api/search?q=One Piece')
data = r.json()
print(data['results'])
```

### Bash/cURL
```bash
#!/bin/bash
ANIME="One Piece"
EPISODES="1-10"

curl -s "https://your-worker.workers.dev/api/download?id=/anime/O/One_Piece&sort=most_downloaded&episodes=$EPISODES" \
  | jq -r '.downloads[].link' > links.txt

# Then use wget or yt-dlp to download
wget -i links.txt
```

---

## File Structure

```
.
├── worker/              # Cloudflare Worker code
│   ├── src/index.ts     # Main API logic
│   ├── wrangler.toml    # Worker config
│   └── package.json     # Dependencies
├── .github/             # GitHub Actions (optional CI)
└── README.md            # This file
```

---

## Tech Details

- Built with TypeScript
- Runs on Cloudflare Workers (uses Workers KV for nothing, just edge compute)
- Scrapes Tokyo Insider anime pages
- No external dependencies beyond CF runtime

---

## Disclaimer

This tool is for educational purposes. Don't abuse the source website. Download what you have rights to.

---

## Contact

Found a bug? Want to add features? Open an issue or hit me up. Discord: x5oc