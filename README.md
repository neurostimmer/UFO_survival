# UFO Survival

TypeScript port of [Hyrum Adams's "UFO Survival"](https://studio.code.org/projects/gamelab/) — originally built on code.org's Game Lab — running as a static webpage.

**Play it:** https://neurostimmer.github.io/UFO_survival/

## Stack

- **Vite** + **TypeScript** (strict)
- **Biome** for lint + format
- **Vitest** for unit tests
- **Zero runtime dependencies** — Canvas2D, Web Audio, `requestAnimationFrame`, `localStorage`. No game framework.

## Layout

```
src/
  main.ts                # bootstrap + fixed-step game loop
  game.ts                # the ported game (state machine, screens as functions)
  gamelab/               # thin compat shim over code.org's Game Lab API
    sprite.ts            # Sprite class + lifecycle
    renderer.ts          # Canvas2D wrapper (background/fill/text/...)
    input.ts             # key state diffing, snapshot-per-tick
    audio.ts             # Web Audio with deferred AudioContext
    assets.ts            # named-image preloader
    scheduler.ts         # fixed-step accumulator (30 FPS)
    index.ts             # barrel + LEFT/CENTER/TOP + randomNumber
public/assets/           # 25 sprite PNGs + music_loop.mp3 (CC0)
                         # generated from /assets via `npm run sync-assets`
tests/                   # Vitest unit tests for the deterministic shim pieces
original/                # frozen code.org source — do not modify
assets/                  # canonical sprite sources
scripts/                 # check_sprites.py + sync_assets.mjs
```

The split is deliberate: `src/gamelab/` is the rebuildable seam. Swapping the rendering backend (WebGL, OffscreenCanvas, etc.) should only touch the shim, never `src/game.ts`.

## Dev scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with HMR at `http://localhost:5173/` |
| `npm run build` | Typecheck + emit production `dist/` |
| `npm run preview` | Vite preview of the built output |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | Biome check |
| `npm run format` | Biome format-write |
| `npm test` | Vitest one-shot |
| `npm run test:watch` | Vitest watch mode |
| `npm run sync-assets` | Re-copy `assets/` → `public/assets/` after sprite changes |
| `npm run check-sprites` | Python audit script for sprite transparency |

Node 24 is the supported runtime. CI uses `npm ci` against the committed `package-lock.json`; do the same locally if you hit lockfile drift.

## Pushing new builds

Push to `main`. That's the whole flow.

`.github/workflows/pages.yml` runs on every push to main:

1. `npm ci` (clean install)
2. `npm run lint` (Biome)
3. `npm test` (Vitest)
4. `npm run build` (typecheck + Vite build)
5. Upload `dist/` as a Pages artifact
6. Deploy to GitHub Pages

If any of steps 2–4 fail, no deploy happens. Watch the [Actions tab](https://github.com/neurostimmer/UFO_survival/actions) for status.

To run the workflow manually (e.g., to redeploy without a code change): Actions → "Deploy to GitHub Pages" → Run workflow.

## Controls

| | Title | Difficulty | Gameplay |
|-|-|-|-|
| Player 1 | SPACE = 1P | `1` / `2` / `3` for easy / normal / hard | Arrow keys, UP to jump |
| Player 2 | BACKSPACE = 2P | | WASD, W to jump |

`R` restarts from the difficulty screen. `C` on the win screen extends the goal by 25 and grants +1 health.

## Security

CSP meta tag in `index.html` restricts everything to same-origin. `frame-ancestors 'none'` is documented as a deploy-time HTTP response header — GitHub Pages doesn't expose custom headers, so the page is iframable on the live site. See `SECURITY.md` for the full threat model and hardening notes.

## Credits

- **Original game:** "UFO Survival" by Hyrum Adams (code.org Game Lab)
- **Music:** "8-Bit Epic Space Shooter Music" by HydroGene — CC0, [opengameart.org](https://opengameart.org/). Attribution at `public/assets/music_loop.LICENSE.txt`.
