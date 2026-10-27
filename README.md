# Nirav Surabhi — personal portfolio

A white-walled 3D studio you can look around in, built with three.js. It's a static site with no framework and no build step.

## How it works

- Visitors stand in a small white-walled studio (6 × 5.6 m), facing the first wall: the name sign, a note ("Start at 01
  on the left and follow the numbers around the room") and the three lead projects. Drag or swipe turns the view;
  clicking a numbered label flies the camera in and opens a panel.
- The stations run clockwise in one order, robotics and machine learning first, and the dock, the numbers on the
  labels and the tour all follow it: back wall **01 Arm sim** (the SO-101 reaching for each target the vision-language
  model picks, with real inverse kinematics), **02 MARSChair** (the MARS Lab robot taking a chair from staging, along
  the first wall and round a 1.5 m arc to tuck it under the desk; translucent ghosts ride along, other runs with
  friction, mass and center of mass randomized ±30%), **03 FTC** (the robot on field tiles); right wall **04 LEGO
  engine** (on the window ledge, crank-driven, the Purdue Bell Tower outside, the video in its panel), **05 Research**
  (the vortex-propulsion rig under a live flow display); front wall **06 SpareMe** and **07 Silk** (the phone and PC on
  the desk), **08 More projects** (the pinboard above it), **09 About** (a wall of blue LEGO baseplates, the pixels 1×1
  plates), **10 B-side** (guitar); left wall **11 Contact** (the door, which swings open onto daylight).
- **Start the tour** over the dock opens 01 and then offers the next station each time you're back in the room;
  every panel has previous / next, and the arrow keys walk the tour too. `#marschair` etc. deep-link.
- All panel content is plain HTML in `index.html`. **List view** shows it as an ordinary page, and
  that is also what browsers without WebGL2 get.
- Wide screens and phones held sideways get a side panel; portrait phones get a bottom sheet, and
  each station's camera pulls back until its object fits the space the panel leaves.

## Files

- `index.html` — page shell, HUD, panel content, styles.
- `room/main.js` — renderer, post-processing, look-around camera, stations, panels, the animated screens
  (Silk terminal, SpareMe call, arm-sim instruction), MARSChair's mission loop, the arm's reach loop, the door, the loop.
- `room/shell.js` — the room: `WALLS` / `onWall()` / `place()` (positions along each wall, facing into the room), walls
  with the door and window cut out, oak floor, daylight, station spotlights, name sign,
  welcome note, pinboard, the LEGO "about me" wall, FTC tiles, the wall display, the light behind the door, and the view out of the
  window. That view is a portal: a shader looks up each pixel's direction in a campus panorama painted once at load
  (a small projected scene of brick buildings, trees and walks), so it holds still like real distant scenery. The Bell
  Tower is a 3D model rendered once into its own texture, with a mask for the trees in front of its base.
- `room/models/` — procedural models: `kit.js` (shared materials + a mesh-merging builder),
  `robot.js` (FTC), `windtunnel.js`, `props.js` (desk, chair, guitar, stool, shelf, sideboard, plant),
  `marschair.js` (Fetch Freight base, 4040 frame and cradle, two reBot B601 arms, sled chair),
  `armsim.js` (SO-101 on a bench with its stereo head camera; geometry simplified from TheRobotStudio's Apache-2.0
  meshes and stored meshopt-compressed, license in the file), `legoengine.js` (the LEGO vacuum engine, reconstructed
  from `img/lego/engine.mp4`), `fixtures.js` (the oak door and the iPhone), `belltower.js` (the Purdue Bell Tower, for
  the window).
  Preview any model with `room/dev/preview.html?m=marschair` (not deployed).
- `room/dev/qa.html` — headless QA: steps the loop with `__room.advance()` and POSTs canvas frames to a local
  `/__shot` endpoint (headless Chrome barely ticks `requestAnimationFrame` when the display sleeps). Steps include
  `stats` (draw calls, triangles, texture memory) and `&tier=low` previews the phone settings.
- `wake.js` — a D2Q9 lattice-Boltzmann flow solver in WebGL2. It drives the live flow on the wall
  display and in the Research panel. The fin is free to pivot, and its angle comes from the
  simulated flow.
- `vendor/three/` — three.js r186 (core minified with esbuild) and the addons the room uses.
- `vendor/meshopt/` — meshoptimizer's decoder (MIT), for the arm meshes.
- `fonts/` — Archivo and JetBrains Mono (SIL OFL), trimmed to Latin and the weights and widths the site uses, so no
  third-party font requests block the first paint.
- `img/room/` — small copies of images that only appear as textures in the room (pinboard cards, the photo
  in the LEGO mosaic); the panels load the full-size files when they open.
- `vercel.json` — longer caching for `vendor/`, `fonts/` and `img/` (pages and room scripts still revalidate, so a
  deploy shows up at once).
- `resume.html`, `resume-mechanical.html` → `Resume.pdf`, `Resume-Mechanical.pdf` (print
  instructions in each file's header comment).
- `og.html` → `og.png` — the share card.

## Performance

- First visit: about 0.5 MB compressed before any panel opens (three.js is about 160 KB of that); panel images, the
  engine video (6.4 MB, 540p) and the guitar clips load only when opened.
- Phones and 4-core machines get the low tier: a smaller floor texture, half-resolution bloom, no spotlight shadows,
  and 30 fps after a few seconds without input (60 while someone is interacting). Every device is capped at 60 fps, and
  the resolution steps down if frames run long; slow GPUs can also drop MSAA and bloom. A pixel budget bounds the
  starting resolution on large displays. `?tier=low` previews the tier on a desktop.
- Nothing in the window's sunlight moves, so the sun's shadow map is drawn once; station spotlights redraw theirs only
  while their station is on screen. Animations, screens and the flow solver only run while they're in view.
- Shaders compile before the room appears, with parallel compilation where the browser supports it.
- If the 3D code can't load, the page falls back to the list view instead of waiting on the loader.
- List view and hidden tabs stop the room renderer; the flow solver only runs while visible. Reduced-motion mode
  shows a still flow frame. Both WebGL contexts restore their generated resources after context loss.
- GPUs without float color buffers use 8-bit render targets without PMREM, bloom or outline passes. The list-view
  fallback, image/document viewer and video controls initialize independently of the 3D module.

## Verification

`node --test room/dev/frame-pacing.test.mjs` covers 30/60 fps pacing on 60–240 Hz displays, slow-renderer adaptation,
and idle/resume transitions. Development files are excluded from deployment through `.vercelignore`.

The October 2026 checks exercised Chrome and WebKit on macOS at desktop and emulated phone sizes, plus float-extension
failure, module-load failure, a stalled flow-script request, and forced WebGL loss/restoration. Emulation does not
establish performance on physical phones. Firefox's test binary failed to launch with “Could not find profile folder”,
so Firefox runtime behavior remains unverified.

## Local preview

ES modules are cached aggressively, so serve with caching off while editing (the deeper accept queue matters: the page
preloads its whole module graph at once):

```sh
python3 -c "import http.server as h
class H(h.SimpleHTTPRequestHandler):
  def end_headers(s): s.send_header('Cache-Control','no-store'); super().end_headers()
class S(h.ThreadingHTTPServer): request_queue_size = 128
S(('',8000),H).serve_forever()"
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
