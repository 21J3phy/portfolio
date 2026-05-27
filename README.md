# Nirav Surabhi — Personal Portfolio

Single-file static portfolio. Dark-mode default with a light toggle, built with
plain HTML/CSS/vanilla JS — deployable to Vercel with zero config.

## Highlights

- **3D "Software ⇄ Mechanical" pill** in the hero, rendered with [Three.js](https://threejs.org/)
  (loaded from a CDN). A real `CapsuleGeometry` rolls about its long axis: it holds on
  "Software" (blue), eases 180° to "Mechanical" (amber), holds, and continues another
  180° back to start. Labels are baked with `CanvasTexture`; respects
  `prefers-reduced-motion`.
- `image-slot.js` — drag-and-drop image placeholders. Project screenshots and company
  logos are pre-filled via the `src` attribute; the face and a couple of slots are left
  open to fill in later.

## Local preview

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy

Zero-config static deploy on Vercel — push to the connected repo, or:

```sh
vercel --prod
```

## TODO before going fully live

- Real `og.png` (1200×630) and `Resume.pdf` at the project root.
- Optional headshot in the About face slot, a PredictionView screenshot, and a
  wind-tunnel / paper image for Passive Vortex Propulsion.
- Confirm `niravsurabhi.com` canonical / OG URLs.
