# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project intent

Port a code.org Game Lab game ("UFO Survival" by Hyrum Adams) to a TypeScript app that runs in any modern browser without heavy runtime dependencies. **Initial priority: high-fidelity reproduction of the original behavior.** Refactors come after the port runs identically.

The original code.org script is preserved verbatim at `original/game.code-org.js`. Treat it as the frozen spec — when in doubt about gameplay behavior, compare to that file rather than reasoning from the TypeScript port.

## Repository state

The repo is currently a clean slate. Only `original/game.code-org.js` exists. Build tooling, source layout, and the runtime shim still need to be created. Do not assume any file paths below exist yet — they describe the **target** structure.

When introducing tooling, prefer **Vite + TypeScript** (single small dev dep, native ES modules, no bundler config to maintain). Avoid Phaser/PixiJS/p5.js for the core port; the whole point is hardware-agnosticism without burdensome dependencies. A plain `<canvas>` + Web Audio is enough.

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
- **Audio**: `playSound(url, loop)`. Original passes `"sound://category_music/clear_evidence_loop1.mp3"` — that's a code.org internal scheme. Map it to a local asset path or replace with a royalty-free substitute; document the mapping in `src/gamelab/assets.ts`.
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
