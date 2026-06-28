# 🐤 Flappy Rush

A juiced-up Flappy Bird clone with skins, combos, power-ups, and shareable score cards.

**By Santos Automation** · `v1.0.0-mvp`

[**▶ Play it**](#running) — tap, click, or hit **Space** to fly.

---

## What it is

A single-file-ish HTML5 Canvas game (just `index.html` + `game.js` — **no build step, no dependencies, no backend**). 9:16 portrait, mobile-first, runs in any modern browser. Everything you earn persists in `localStorage`.

## Features

| Category | What's in |
| --- | --- |
| **Core loop** | Gravity + flap physics, scrolling pipes, +1 per pipe, rising difficulty |
| **Combo system** | Clean/near-miss passes build a 1x→5x multiplier with a decay timer |
| **Power-ups** | 🛡️ Shield · 🐌 Slow-mo · 🧲 Coin magnet · 🔻 Tiny mode |
| **Coin economy** | Collect coins, spend them in the shop |
| **Skins** | Classic, Chrome, Gold Drip, ATM Bird, Santos Automation |
| **Difficulty** | Easy / Normal / Insane (gap, speed, moving pipes, gravity-flip zones) |
| **Juice** | Screen shake, particle bursts, motion trail, **slow-mo death cam** |
| **Day/Night** | Sky lerps through day → sunset → night with stars + moon |
| **Meta** | Local top-10 leaderboard (arcade initials), achievements, daily challenge |
| **Audio** | Procedural Web Audio SFX + layered music that builds with your score |
| **Share** | Auto-generated branded score card → native share / PNG download |
| **Extras** | Double-jump/dash (toggleable), gravity-flip zones, ghost-run recording, moving pipes |

## Controls

- **Fly:** tap / left-click / `Space`
- **Dash (if enabled):** double-tap / `↑`
- **Restart on game over:** `R` or the Retry button

## Running

It's static — just open it or serve the folder:

```bash
# any static server works
python3 -m http.server 8000
# then visit http://localhost:8000
```

Or open `index.html` directly in a browser. For deployment, drop the folder on **GitHub Pages**, **Vercel**, or **Netlify**.

## Data model (localStorage)

`fr_total_coins`, `fr_high_scores`, `fr_unlocked_skins`, `fr_equipped_skin`, `fr_achievements`, `fr_best_ghost`, `fr_settings`, `fr_daily`, `fr_lifetime_coins`.

Reset everything from **Settings → Reset All Data**.

## Roadmap (v2 ideas)

- Supabase/global online leaderboard
- Hand-crafted finite "Level" mode with finish gates
- Full branded theme bundles for cross-promo

---

🤖 Built with [Claude Code](https://claude.com/claude-code)
