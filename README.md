# Nirav Surabhi — personal portfolio

An ordinary scrolling page with a mountain road behind it. Scrolling drives the car. It's a static site with no
framework and no build step (three.js, vendored).

## How it works

There are three ways to see it, switched by the control at the top (`setMode` in `drive/main.js`):

- **Tour** (the default): scrolling runs the film described below.
- **Free drive** (`?mode=free`): the same road with the keys driving the car: W/S or ↑/↓, A/D or ←/→, space to
  brake; on a touch screen, on-screen buttons. It is a car on a ribbon (`stepFree`): a speed, an angle to the road
  and a place across it; left alone it follows the bends, and the rock wall and the guardrail are walls. Stopped
  anywhere, E gets the driver out, and then **you walk him yourself** (`stepMan`): W/A/S/D relative to where the
  camera looks, Shift to run, C to crouch (near an exhibit that brings the close view of it, and the mouse goes
  round it). A click gives the mouse to the camera (Escape takes it back); with it, a click reads the sign in the
  middle of the view. The wall, the rail, the car and whatever stands at the stops are solid. E beside the car gets
  back in.
- **Classic** (`?mode=page`; the road is not loaded at all): the same work as an ordinary scrolling page, given the
  same care. The drive's opening frame is its cover; each project sits beside a still of its exhibit taken on the
  road (`img/stops/`, captured from the drive itself), alternating sides, with the picture holding its place while
  the write-up scrolls past; things arrive as they are scrolled to; an index runs down the side on a wide screen;
  the last section and the foot are dark. Its rules are the "classic view" block in `site.css`, and it works
  without WebGL and (apart from the reveals) without scripts.

- The page is a hero and twelve sections. Each section is a **destination** on the road: a turnout with that
  project's model standing in it, announced by a green guide sign.
- **Scrolling runs a film.** Where everything is depends only on how far the film has run (`timeline`, `BEAT`,
  `legAt` in `drive/main.js`). At a destination it runs exactly as far as it is scrolled: the driver gets out, walks
  to the sign, then to the exhibit, back, and in; stop scrolling and he stops; scroll back and it runs backwards.
  **On the road the car drives itself**: once a scroll has pulled it away it carries on to the next destination and
  brakes into it, and scrolling only hurries it. (Scrolling back mid-road stops it there.)
- **The page itself does not scroll** while the road is up. A page long enough to hold the film would be a hundred
  screens tall, and a browser's own scrolling cannot be nudged along without fighting it; so wheel, touch and keys
  move the film instead, through a spring, and nothing starts or stops with a jerk (`stepScroll`, `push`, `cutTo`).
  Arrow keys, Page Up/Down, space, Home and End work. A jump (a route dot, the Contact button, a `#hash`) is a cut
  to that destination, not a fast-forward. The credits come up as a card when the film ends.
- **At a destination the driver gets out**: by the driver's door, round the bonnet and up to the sign, which he
  reads. Then he **looks the exhibit over the way that exhibit asks to be looked at**, which is different at every
  stop (`tour(...)` in `drive/exhibits.js`: the places he goes, in order, what he faces at each, whether he gets
  down to it, and the way round whatever is in between). At the MARS lab he goes to the table with the model of the
  building on it, then round the end of it to the full-size robot and watches it tuck a chair under a table (the
  last half minute of one placement from the same recorded run, replayed at 1:1: `createTuckDemo` in
  `models/marsroom.js`). At the FTC robot he gets down to it from the front, the side and behind; at the desk he
  reads the terminal and then crouches to the phone; and so on. Then he walks back and gets in.
- **The camera** follows behind him, over his shoulder, the way a third-person game follows its character: it keeps
  facing up the road while he walks about in front of it, and does nothing on its own. Each time he stops to look
  at something the view goes in past his shoulder to a close view of that thing, from his side of it; there a drag
  goes round it (pinch, or ctrl + wheel, moves in and out). He walks as fast as the film is run and faces the way
  he is going (`planWalk`, `walkAt`, `stepSeq`, `placePerson`). With reduced motion he stays in his seat.
- **What the page says about a project is on a sign, not on the screen.** Every exhibit faces down the road, at
  whoever is arriving, and its sign stands beside it, in line with its front and facing the same way. It is printed
  from the page's own markup: the heading, the opening
  paragraph, the first picture and the headline numbers (`makeSign`, `placeSign` in `drive/exhibits.js`). Nothing
  written appears over the road by itself. Clicking the sign opens that project's full write-up as a panel; Escape,
  the ×, a click elsewhere or scrolling on closes it. The write-ups are still ordinary HTML in `index.html`: they
  are simply not displayed while the road is (`.dest` in `site.css`), and are the whole page when it is not.
- The car's speed is how fast the film is moving: about 75 mph when it is driving itself, up to 85 mph (`VCAP`) when it
  is hurried, and never more however hard it is scrolled. A stop plays no faster than a jog (`WALKCAP`).
  That is what the speedometer, the gears, the nose dipping under braking and the brake lamps read (`stepCar`).
- The **dashboard** shows it: speedometer, gear and revs, a brake lamp, elevation and trip distance. The **map** in
  the other corner is the road from above, turned so the car points up: mountain on one side, sea on the other, the
  driven part in orange, the destinations numbered, with the next stop, its distance, the distance left and the
  stops passed beside it (`drive/minimap.js`). It steps aside while a write-up is open over its corner. The line along the
  bottom is the whole route; its dots jump to a destination.
- **Sound** is off until the Sound button is pressed (a browser will not play any before a click anyway), and
  neither the code nor the recordings load until then: `drive/sound.js`, `drive/assets/audio/`.
- **The opening**: the page loads looking at the car from the front. The first stretch of scroll walks the camera
  round it, out over the drop on the sunlit side, to a chase position behind it; only when the camera is there does
  the car pull away (`OPEN`, `opening()` and `intro` in `drive/main.js`). A fast flick still plays the move.
- On the road the camera is a driving game's chase camera: behind and a little above the car, pulling back and
  opening the lens with speed. It stays there as the car parks; when the driver gets out it hands over to the
  camera behind him, and back when he sits down again.
- What stands at the destinations runs on its own clock, scrolled or not, and is real work moving for real: the SO-101 solving its inverse kinematics, the
  MARSChair building at 1:10 replaying a recorded run (`data/marsroom-run.json`) beside the full-size robot and
  furniture, the HOPPER rover at full size replaying a recorded MuJoCo walk and jump (`data/hopper-run.json`), and a
  billboard plotting the 344-neuron Lazy Genius recipe (`data/lazy-recipe.json`).
- All content is plain HTML in `index.html`. Without WebGL2, without scripts, or with `?page`, the same page shows
  without the road, write-ups and all.
  `#spareme` and `#silk` land on Software.

## What is photographed and what is built

- **Sky, sun, far coast, haze**: Poly Haven's "Table Mountain 1" HDRI (CC0). The tonemapped panorama is the
  backdrop (`drive/assets/sky_8k.webp`, `sky_4k.webp` on phones: its upper band, down to −22.5°); a 512-pixel HDR
  (`sky_env.hdr`) lights and reflects in everything. The sun light's direction comes from the photograph.
- **Road and rock**: Poly Haven's scanned PBR textures (asphalt_02, cliff_side, aerial_rocks_02; CC0) on geometry
  extruded along the route: a cross-section from the ridge above the road down to the sea, displaced with noise.
  The rock is sampled at three scales at once so the tile never repeats visibly, and pulled toward the sandstone in
  the photograph. Far from the road the mountain follows a smoothed copy of the route, so bends don't fold it.
- **The sea** is built near the mountain and thins out with distance, so the photograph's own sea and horizon take
  over.
- **The car**: "2012 Honda Civic Si Coupe" by Ddiaz Design (sketchfab.com/ddiaz-design), **CC BY-NC-SA 4.0**,
  repainted white. Keep the credit in the page footer.
- **The driver**: avatar `Male_Adult_17` from Microsoft's Rocketbox library (github.com/microsoft/Microsoft-Rocketbox,
  **MIT**), with eight of the library's own recorded takes: walk, run, two idles, sitting, a hand-at-the-chin
  "thinking it over", and two crouching ones for looking at something closely. Any of the library's 40 adults can be swapped in: open `dev/tools/convert_driver.html` in a
  browser with the FBX files beside it, then run `dev/tools/pack_driver.mjs` on what it exports.
- **Sound**: thirty CC0 recordings (1.7 MB), credited one by one in `drive/assets/audio/CREDITS.md`. The engine is a
  real naturally aspirated inline four held steady on a dyno (a Mercedes 190E 2.3-16, not a Civic: it was the only
  free set recorded at known engine speeds, on and off load, from both the exhaust and under the bonnet). Each loop
  plays at the ratio of the car's revs to its own measured revs and crossfades with its neighbours; throttle fades
  between the on-load and off-load sets; where the camera is decides how much exhaust and how much engine bay.
  Tyre roar, wind and the indicator are synthesised; door, handbrake, footsteps, gulls and the sea are recordings.
  Levels are the `MIX` table at the top of `drive/sound.js`.
- Guardrail, posts, lane paint, signs, boulders and scrub are procedural; so are the project models (`models/`).

## Files

- `index.html` — the page: hero, destination cards, dashboard markup. `site.css` — styles.
- `drive/main.js` — renderer, scroll mapping, car dynamics, camera direction, dashboard, loop.
- `drive/route.js` — the road's centreline (heading, grade, curvature every 2 m).
- `drive/world.js` — sky dome, sea, mountainside, pavement, paint, guardrail, boulders, signs, sun.
- `drive/car.js` — loads the car and sets up its wheels, paint, lamps and plate.
- `drive/person.js` — the driver: loads the figure and blends his motions by what he is doing.
- `drive/minimap.js` — the map in the corner.
- `drive/sound.js` — engine, road, wind, sea and the small sounds; `dev/sound.html` is a page for listening to it
  on its own with every input on a slider.
- `drive/exhibits.js` — what stands at each destination, and its playback.
- `drive/assets/` — the car, the driver, the sky, the textures and (`audio/`) the recordings. `dev/tools/pack_car.mjs` repacks the car from the original.
- `models/` — procedural models (`kit.js` is the shared material and mesh-merging kit).
  `dev/preview.html?m=hopper&fn=createHopper` previews one (not deployed).
- `data/` — the recorded runs and the neuron recipe; `dev/tools/` holds the scripts that exported the runs.
- `blog/` — the blog (`/blog`), written as a Notes app.
- `wake.js` — the lattice-Boltzmann flow solver behind the live figure in the vortex-propulsion card.
- `vendor/three/` — three.js r186 and the addons used (GLTFLoader, HDRLoader, post-processing).
  `vendor/meshopt/` — the mesh decoder for the car and the arm.
- `og.jpg` — the share card, a frame of the opening shot.

## Performance

About 7.2 MB of files in all before sound, roughly 6 MB over the wire once the host compresses the scripts: textures
2.6 MB, the car 1.2 MB, the driver 0.85 MB, three.js 0.8 MB, the sky 0.7 MB. Sound adds its recordings only if it
is switched on. What keeps it quick:

- **Loading**: the page head preloads every module and every file the first frame needs, so they download in
  parallel. The car starts downloading before anything else. Textures are decoded off the main thread
  (`createImageBitmap`) and uploaded as they arrive.
- **The first frame draws only the road and the car.** What stands at the destinations is built afterwards, one
  exhibit at a time in idle moments, nearest first, each with its shaders compiled before it is shown
  (`buildExhibits` in `drive/exhibits.js`, `pump` in `drive/main.js`). While the car is moving only what it is about
  to reach is built.
- **The car file** is meshopt-compressed with WebP textures (`dev/tools/pack_car.mjs` made it from the 3.65 MB
  original; the decoder is `vendor/meshopt/`). Its glass is plain tinted transparency: the original's "transmission"
  glass makes three.js draw the whole scene twice a frame.
- **Each frame**: one scene pass with a 2048 shadow map, bloom at quarter resolution (fed a capped picture: the sun
  and its glints on chrome are hundreds of times brighter than white, and blooming them whole veils the frame), and a single final pass that
  does tone mapping, colour space and the lens. The dashboard only writes to the page when a value changes.
- **When nothing moves** (car parked, camera settled, no exhibit running) the picture is redrawn about 16 times a
  second instead of every frame.
- **If frames come late** for a while, resolution goes first, then bloom, then more resolution, then shadow detail
  (`tick` in `drive/main.js`). It measures the time between frames, so a slow GPU counts. If a step buys nothing
  (a phone in low-power mode simply draws at 30), the step is undone and it stops.
- Phones and 4-core machines get the low tier (`?tier=low` to try it): the 4k sky, fewer boulders and scrub, a
  smaller shadow map, 2× instead of 4× antialiasing. Reduced motion takes the give out of the scroll, with no shake or smear.
- `performance.getEntriesByType('mark')` shows the start-up milestones: `world`, `car`, `assets`, `compiled`,
  `first-frame`. The loader offers the page without the road after 15 s.

## Phones

Everything above works by touch. A swipe up or down runs the film and a sideways drag looks around; on a tall
screen the camera stands further back so a sign fits across; a write-up opens as a sheet from the bottom; free
drive has four on-screen buttons; the classic view is a single column. Phones get the low graphics tier.

## Local preview

```sh
python3 -c "import http.server as h
class H(h.SimpleHTTPRequestHandler):
  def end_headers(s): s.send_header('Cache-Control','no-store'); super().end_headers()
class S(h.ThreadingHTTPServer): request_queue_size = 128
S(('',8000),H).serve_forever()"
# open http://localhost:8000
```

`window.__drive.advance(seconds)` steps the loop by hand, `__drive.goto(n)` drives to destination `n`, and
`await __drive.built()` builds every exhibit now (headless browsers barely tick `requestAnimationFrame`).

## Deploy

Vercel project `personal-portfolio` deploys `main` to niravsurabhi.com on push.

The room this replaced (a 3D lab with baked light) is kept on the local branch `lab-room-snapshot`.
