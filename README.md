# Nirav Surabhi — personal portfolio

A 3D studio you can look around in, built with three.js. It's a static site with no framework and no build step.

## How it works

- Visitors land facing the back wall (name sign + a note: "look around 360° and click on things").
  Drag or swipe turns the view; clicking a labelled station flies the camera in and opens a panel.
- Stations: **Research** (the vortex-propulsion rig and a live flow display), **SpareMe** (desk),
  **Robotics** (the FTC robot on field tiles), **More projects** (pinboard), **About** (whiteboard),
  **B-side** (guitar). The dock at the bottom opens any of them directly; `#research` etc. deep-link.
- All panel content is plain HTML in `index.html`. **List view** shows it as an ordinary page, and
  that is also what browsers without WebGL2 get.
- Wide screens and phones held sideways get a side panel; portrait phones get a bottom sheet, and
  each station's camera pulls back until its object fits the space the panel leaves.

## Files

- `index.html` — page shell, HUD, panel content, styles.
- `room/main.js` — renderer, post-processing, look-around camera, stations, panels, loop.
- `room/shell.js` — the room: walls, lights, window, name sign, welcome note, pinboard, whiteboard,
  FTC tiles, and the wall display.
- `room/models/` — procedural models: `kit.js` (shared materials + a mesh-merging builder),
  `robot.js`, `windtunnel.js`, `props.js` (desk, chair, guitar, stool, shelf).
  Preview any model with `room/dev/preview.html?m=robot` (not deployed).
- `wake.js` — a D2Q9 lattice-Boltzmann flow solver in WebGL2. It drives the live flow on the wall
  display and in the Research panel. The fin is free to pivot, and its angle comes from the
  simulated flow.
- `vendor/three/` — three.js r186 (core minified with esbuild) and the addons the room uses.
- `resume.html`, `resume-mechanical.html` → `Resume.pdf`, `Resume-Mechanical.pdf` (print
  instructions in each file's header comment).
- `og.html` → `og.png` — the share card.

## Local preview

ES modules are cached aggressively, so serve with caching off while editing:

```sh
python3 -c "import http.server as h;
class H(h.SimpleHTTPRequestHandler):
  def end_headers(s): s.send_header('Cache-Control','no-store'); super().end_headers()
h.ThreadingHTTPServer(('',8000),H).serve_forever()"
# open http://localhost:8000
```

## Regenerating the share card

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --use-angle=metal \
  --hide-scrollbars --window-size=1200,630 --virtual-time-budget=15000 \
  --screenshot="$PWD/og.png" "file://$PWD/og.html"
```

## Deploy

Vercel project `personal-portfolio` deploys `main` to niravsurabhi.com on push.
