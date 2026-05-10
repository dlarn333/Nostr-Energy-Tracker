# ⚡ Nostr Energy Tracker

> *"The real energy leak is rarely the tool. It's scrolling without intention."*

A personal signal tracker for Nostr. Know where your energy is going — by feed, by topic, by week — so you can use the protocol with intention instead of habit.

---

## What It Does

Most people on Nostr don't know which feeds drain them and which ones fuel them. This app fixes that.

You connect your npub, log your sessions, and over time the data shows you:

- Which feeds leave you feeling depleted
- Which topics energize you vs. pull you down
- Whether you're a net zapper or net receiver
- How your energy trends across the week

No browser extension needed. No private key ever asked for. Just honest data about how you're showing up on Nostr.

---

## Features

- **Relay connection** — connects live to Damus, nos.lol, and relay.nostr.band using your npub
- **Interest detection** — scans your recent posts and hashtags to auto-detect what you care about
- **Session logging** — log any Nostr session with feed, time spent, zaps, energy rating (1–10), and topic tags
- **Energy dashboard** — live gauge, session history bars, feed breakdown, drain vs. gain zones
- **Topic energy map** — see exactly which topics score highest and lowest for your energy
- **Weekly report** — full signal report with insights and recommendations

---

## Stack

- React 18
- Vite 5
- Native WebSocket (no Nostr library needed)
- Zero external UI dependencies

---

## Setup

You need [Node.js](https://nodejs.org) v18 or higher.

```bash
# Clone
git clone https://github.com/YOUR_USERNAME/nostr-energy-tracker.git
cd nostr-energy-tracker

# Install
npm install

# Run locally
npm run dev
```

Open **http://localhost:5173** in your browser.

---

## File Structure

```
nostr-energy-tracker/
├── src/
│   ├── App.jsx        ← entire app (logic + UI)
│   └── main.jsx       ← React entry point
├── index.html
├── package.json
├── vite.config.js
└── README.md
```

---

## Deploy Free (Vercel)

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → sign in with GitHub
3. Tap **Add New Project** → select this repo
4. Leave all settings as default
5. Tap **Deploy**

Live in under 2 minutes. Works fully on mobile — no computer required.

---

## Deploy Free (Netlify)

1. Push this repo to GitHub
2. Go to [netlify.com](https://netlify.com) → sign in with GitHub
3. **Add new site → Import an existing project**
4. Build command: `npm run build`
5. Publish directory: `dist`
6. Tap **Deploy site**

---

## Relays

Connects read-only to:

- `wss://relay.damus.io`
- `wss://nos.lol`
- `wss://relay.nostr.band`

---

## Privacy

- Your npub is public by design on Nostr — that's all we use
- Your private key is **never** requested, stored, or transmitted
- Session data lives in your browser memory only
- Nothing is sent to any server
- Refreshing the page resets your session log (persistence coming in v2)

---

## Roadmap

- [ ] localStorage persistence so sessions survive page refresh
- [ ] Export session data as CSV
- [ ] Follow list analysis (which npubs energize vs. drain you)
- [ ] Chrome extension for automatic time tracking
- [ ] Zap amount tracking (sats in vs. sats out)

---

## Contributing

PRs welcome. Open an issue first if it's a big change.

---

## License

MIT — use it, fork it, build on it.

---

Built with intention. Not with algorithm. 🔥
