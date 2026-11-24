# JIIT Sector 62 · 3D Campus Map (unofficial)

An interactive 3D map of the JIIT Noida Sector 62 campus, made for first-year students.

**Open `dist/index.html` in any modern browser.** It is a single self-contained file: no
internet, server or install is needed, and it works on phones too.

## Features

- **Real layout:** building footprints, paths, courts, pool and gates come from OpenStreetMap.
- **3D navigation:** orbit, pan and zoom, a top-down 2D view, and a compass (click it to face north).
- **Walk mode:** explore at eye level with WASD and the mouse, or a joystick and drag on phones. You can't walk through buildings.
- **Click any place:** see what's inside, fresher tips, and live *open now / closed* status for the mess and Gate 3 (back gate).
- **Walking routes:** pick any two places to get the distance, walking time and landmarks on the way. You can also watch the route as a first-person walk.
- **Guided fresher tour:** 11 stops with narration, from Gate 1 to the hostels.
- **Search:** understands everyday words like "library", "canteen", "fees" or "auditorium".
- **Day, sunset and night:** the night view has lit windows, street lamps, stars and the moon.
- **Minimap, category filters and shareable links** (for example `index.html#oat` opens on the OAT).

Keys: `/` search · `T` tour · `D` route · `V` walk · `N` day/night · `L` labels · `R` reset · `H` help

## Tech (all free and open source)

| Part | Used |
|---|---|
| 3D engine | [three.js](https://threejs.org) r170 (MIT) |
| Map data | [OpenStreetMap](https://www.openstreetmap.org/copyright) via the Overpass API (ODbL) |
| Bundler | [esbuild](https://esbuild.github.io) (MIT) |
| Textures | generated in code (no image assets) |

## Develop

```bash
npm install --ignore-scripts   # three + esbuild
npm run dev                    # http://localhost:5173 with auto-rebuild
npm run build                  # writes dist/index.html
npm run data                   # re-download OSM data and regenerate src/data/campus-data.js
```

| File | What it holds |
|---|---|
| `src/places.js` | Names, descriptions, tips, floor counts, tour order (edit this first) |
| `src/world.js` | 3D construction: buildings, roads, trees, courts, gates, lamps |
| `src/main.js` | Camera, UI, search, routing, walk mode, tour, day/night, minimap |
| `src/nav.js` | Walking-route graph built from OSM paths |
| `scripts/` | OSM download and conversion to local metre coordinates |

**Improving accuracy:** if a footpath or building is missing or wrong, fix it on
openstreetmap.org (anyone can edit), then run `npm run data && npm run build`.

## Host it for free

Upload `dist/index.html` to any of these:

- **GitHub Pages:** push the repo and enable Pages, or rename the file and upload it.
- **Netlify Drop** (app.netlify.com/drop): drag the `dist` folder onto the page.
- **Vercel, Cloudflare Pages:** any static host works.

## Disclaimer

This is an unofficial map made by students and is not affiliated with JIIT. Building heights, floor counts and
interiors are approximate. Timings come from OpenStreetMap and can change, so always check official notices.
Map data © OpenStreetMap contributors.
