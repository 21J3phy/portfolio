# Nirav Surabhi — personal portfolio

A small static site, written by hand. No framework, no build step.

## Files

- `index.html` — the whole site (HTML + CSS + a little vanilla JS, all inline).
- `resume.html` — the résumé, viewable in the browser; `Cmd/Ctrl-P → Save as PDF` prints
  cleanly to one page via a print stylesheet.
- `og.png` — 1200×630 social-share card. Regenerate from `og.html`:
  ```sh
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
    --window-size=1200,630 --default-background-color=00000000 --virtual-time-budget=5000 \
    --screenshot="$PWD/og.png" "file://$PWD/og.html"
  ```
- `img/` — images (`.webp`, optimized with `cwebp`) and the guitar clips (`.mp4` + posters).
- `paper.pdf`, `conference-certificate.pdf` — the passive-vortex paper and its certificate.

## Design

Warm-paper palette, Source Serif 4 for everything, a single brick-red accent reserved for
links. The page paints on load — no scroll animations, no tilt, no hover effects on anything
that isn't a link or button. Work comes first, strongest projects up top, the rest behind a
"More projects" disclosure.

## Local preview

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy

Zero-config static deploy on Vercel — push to the connected repo, or `vercel --prod`.
