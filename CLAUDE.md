# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project intent

Port a code.org Game Lab game ("UFO Survival" by Hyrum Adams) to a TypeScript app that runs in any modern browser without heavy runtime dependencies. **Initial priority: high-fidelity reproduction of the original behavior.** Refactors come after the port runs identically.

The original code.org script is preserved verbatim at `original/game.code-org.js`. Treat it as the frozen spec — when in doubt about gameplay behavior, compare to that file rather than reasoning from the TypeScript port.

## Repository state

Day-one TypeScript scaffold landed. The structure described in "Architecture" below now exists in code; this section is the up-to-date map.

### Stack (final, see `package.json` for versions)

- **Vite + TypeScript** strict mode, `vite.config.ts` sets `base: './'` so the bundle works under any subpath (Devvit webview, Tauri `tauri://localhost`, GitHub Pages project sites)
- **Biome** — single tool for lint + format
- **Vitest** — unit tests
- **Zero runtime dependencies** — Canvas2D, Web Audio, `requestAnimationFrame`, `KeyboardEvent`, `localStorage`. No Phaser/PixiJS/p5.js.
- Node 24 LTS installed via winget; `package-lock.json` is committed. Any future CI must use `npm ci`, never `npm install`.

### Dev scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server (HMR) at `http://localhost:5173/` |
| `npm run build` | Typecheck + emit `dist/` |
| `npm run preview` | Vite preview of built output |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | Biome check |
| `npm run format` | Biome format-write |
| `npm test` | Vitest one-shot |
| `npm run test:watch` | Vitest watch mode |
| `npm run check-sprites` | Asset audit (Python) |
| `npm run sync-assets` | Re-copy `assets/` → `public/assets/` after sprite changes |

### File layout (current)

```
src/
  main.ts                   # bootstrap + fixed-step accumulator
  game.ts                   # ported game (state machine, screens as functions)
  gamelab/
    index.ts                # barrel + LEFT/CENTER/TOP + randomNumber + setRandomSeed
    sprite.ts               # Sprite class + createSprite/drawSprite(s) + advanceSprites
    renderer.ts             # Canvas2D wrapper for background/fill/text/...
    input.ts                # key state diffing, lowercase-normalized
    audio.ts                # Web Audio playSound, deferred AudioContext
    assets.ts               # preload images by name; resolve setAnimation
    scheduler.ts            # createTickScheduler — pure fixed-step math
public/assets/              # 25 sprite PNGs + music_loop.mp3 + LICENSE.txt
                            # NOTE: copies of /assets — run `npm run sync-assets`
                            # after dropping new sprites in /assets/
tests/                      # 4 unit-test files (scheduler, random, input, sprite)
original/                   # frozen code.org source — do not modify
assets/                     # canonical sprite sources (audit script reads here)
scripts/                    # check_sprites.py + sync_assets.mjs
index.html, vite.config.ts, tsconfig.json, biome.json, package.json
SECURITY.md, .gitignore
```

### Music

CC0 substitute is bundled at `public/assets/music_loop.mp3` ("8-Bit Epic Space Shooter Music" by HydroGene from opengameart.org). License attribution at `public/assets/music_loop.LICENSE.txt`. The audio shim maps the original `"sound://category_music/clear_evidence_loop1.mp3"` URL to this file.

### Security baseline

CSP meta tag in `index.html`: `default-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'`. `frame-ancestors 'none'` must be set as a deploy-time HTTP response header (cannot be set via meta-tag CSP). Details in `SECURITY.md`.

### Parity verification status

The port typechecks, lints clean, and 21 unit tests pass. **Visual parity vs the original code.org page has not yet been done** — that's the next milestone. Until that's signed off, do not "fix" any of the PARITY-tagged quirks in `src/game.ts`.

## Architecture: Game Lab compatibility shim, then game on top

Code.org Game Lab is a wrapper over p5.play / p5.js with a fixed 30 FPS `draw()` callback, a global sprite list, and named-asset animations. Two layers keep the port faithful and the game code rebuildable:

1. **`src/gamelab/` — a thin shim** that reproduces just the Game Lab API surface the original script uses. The game module imports these as functions and a `Sprite` class; it does **not** touch the canvas, audio, or DOM directly. Replacing the shim (e.g., swapping Canvas for WebGL later) must not require touching game logic.

2. **`src/game.ts` — the ported game**, structured as a state machine driven by the `difficulty` and `health`/`points` variables (see "Game state machine" below). The original is one giant `draw()`; the port should split each state into its own function so any single screen can be rebuilt without disturbing the others.

### Game Lab API surface that must be shimmed

Extracted from `original/game.code-org.js` — this is the complete list. Anything not here can be omitted from the shim.

- **Sprite lifecycle**: `createSprite(x, y, w?, h?)`, `sprite.destroy()`, sprite fields `x`, `y`, `scale`, `velocityX`, `velocityY`, `direction` (custom user property — not built-in motion).
- **Animations**: `sprite.setAnimation(name)` resolves a name like `"space_1"`, `"ufo_1"`, `"coin"`, `"retroship_07_1"` to a loaded image/animation. Names are zero-padded for `retroship_01_1` … `retroship_09_1` then unpadded `retroship_10_1` … `retroship_21_1`.
- **Drawing**: `drawSprite(s)`, `drawSprites()` (draws every live sprite in creation order), `background(color)`, `fill(color)`, `text(str, x, y)`, `textSize(n)`, `textAlign(h, v)` with constants `LEFT`, `CENTER`, `TOP`, `rgb(r, g, b, a)`.
- **Input**: `keyDown(name)` (held), `keyWentDown(name)` (edge — true only on the frame the key first goes down). Names used: `up`, `left`, `right`, `w`, `a`, `d`, `1`, `2`, `3`, `r`, `C` (uppercase intentional in source), `space`, `backspace`. `keyWentDown` semantics require per-frame state diffing.
- **Collision**: `sprite.isTouching(other)`. The original uses default sprite hitboxes — bounding-box collision against the rendered animation frame is faithful enough.
- **Audio**: `playSound(url, loop)`. Original passes `"sound://category_music/clear_evidence_loop1.mp3"` — a code.org internal scheme that doesn't resolve outside Game Lab. The substitution map lives in `src/gamelab/audio.ts` (`URL_MAP`); current target is the bundled CC0 `music_loop.mp3`. The shim defers `AudioContext` until the first user gesture (Chromium autoplay) and queues `playSound` calls made before then.
- **Random**: `randomNumber(min, max)` — inclusive integer.
- **Loop**: a top-level `draw()` function called at 30 FPS. The shim should call `draw()` via `requestAnimationFrame` with a fixed 33.33 ms accumulator, not at the monitor refresh rate, or the original tuning (gravity `1.5`, jump `-12`, spawn cadence `100 - difficulty * 25` frames) will drift.

### Game state machine

The original uses `difficulty` as a screen selector. Preserve these exact values when porting — the original's keyboard handlers depend on them:

| `difficulty` | Screen | Entered by |
| --- | --- | --- |
| `-2` | Title / instructions (initial state) | startup |
| `-1` | Difficulty select | SPACE (1P) or BACKSPACE (2P, also sets `players = 3`) from title |
| `1` / `2` / `3` | Gameplay (easy / normal / hard) | keys `1` / `2` / `3` from select |

Win/lose are overlays on top of gameplay state, gated by `health === 0` and `points === winCon` respectively. **R** restarts (reset to difficulty select, not title). **C** on the win screen extends the goal by 25 and grants +1 health.

Two-player mode is encoded as `players === 3` (not 2) — this is intentional in the original. UFO2 is parked offscreen at `y = -10000` in 1P mode.

### Coordinate system and tuning constants

Everything is sized for a **400×400** play field. Hard-coded values that any port must preserve:

- Wall-damage bounds: `x` or `y` outside `[0, 400]`.
- Block spawn cadence: every `100 - (difficulty * 25)` frames at 30 FPS (75 / 50 / 25 frames on easy / normal / hard).
- Block spawn directions are 1=right→left, 2=bottom→top, 3=left→right, 4=top→bottom; speed `±5`.
- Gravity `+1.5` per frame on `velocityY`; jump impulse `-12`; respawn impulse `-15`.
- Win condition `winCon = 25`, increments by 25 on continue.
- Off-screen cleanup currently only fires for blocks with `x < -10` (a known bug in the original — directions 2/3/4 leak. Preserve this until the port is verified, then fix in a labeled follow-up).

### Asset inventory

The 25 named animations referenced by the original, all present in `assets/` as single-frame PNGs:

- `space_1.png` — 400×400 RGBA opaque starfield background
- `ufo_1.png`, `ufo_2.png` — RGBA player ships (teal = P1, red = P2)
- `coin.png` — RGBA gold star
- `retroship_01_1.png` … `retroship_21_1.png` — 21 enemy variants, indexed-color PNGs with `tRNS` transparency chunks (zero-padded 01–09)

**Single-frame decision.** Code.org's `setAnimation("retroship_07_1")` API implies these were multi-frame strips (the trailing `_1` looks like a frame index). The export couldn't be coaxed into giving up additional frames, so the port treats every name as a static still. The shim's `setAnimation` should resolve a name to a single image and not assume any animation timeline. If multi-frame art ever does materialize, extend the loader rather than the call sites.

**Format note.** Retroships are palettized (PNG color type 3 + `tRNS`). Canvas `drawImage` handles them natively, so no normalization is needed for rendering. If we later add per-pixel collision or palette swaps, convert to RGBA at load time.

A standalone audit script is checked in at `scripts/check_sprites.py` — re-run it after any asset replacement to confirm color modes and corner-alpha sanity.

## Working principles for this port

- **Don't refactor before parity.** The first milestone is "looks and plays identical to the code.org original." Splitting screens into modules, adding TypeScript types, etc. all happen *after* a side-by-side comparison passes.
- **Keep the shim and the game separable.** The shim is the rebuildable seam — if a future iteration switches rendering backends (WebGL, OffscreenCanvas, a different framework), only `src/gamelab/` should change.
- **Preserve original quirks behind comments.** Examples: `players === 3` for 2P, `health = 11` on restart (not 10), `keyWentDown("C")` requiring uppercase, the off-screen-cleanup bug. Each is a deliberate signal to a future reader that "yes, this is on purpose, and it matches the spec."
