#!/usr/bin/env python3
"""Generate the 800x800 deep-space starfield background (assets/space_1.png).

Procedural, reproducible (fixed seed). Produces a NON-tiled, non-repetitive
RGBA opaque starfield:
  - near-black deep-space base (~#02030a)
  - a few faint, low-alpha nebula clouds for large-scale variation
  - uneven star density (a smooth low-frequency density field)
  - varied star size (mostly 1px, some 2px, a few bright 3-4px)
  - varied brightness + color temperature (whites, faint blues, faint amber)

Run from the repo root:  python scripts/gen_background.py
Then:                    npm run sync-assets
"""
from __future__ import annotations

import os
import numpy as np
from PIL import Image

SIZE = 800
SEED = 20260623
BASE = np.array([2, 3, 10], dtype=np.float32)  # ~#02030a

rng = np.random.default_rng(SEED)


def smooth_noise(shape, scale, gen):
    """Low-frequency noise in [0,1]: upsample a small random grid (bilinear)."""
    small_h = max(2, shape[0] // scale)
    small_w = max(2, shape[1] // scale)
    grid = gen.random((small_h, small_w)).astype(np.float32)
    img = Image.fromarray((grid * 255).astype(np.uint8))
    img = img.resize((shape[1], shape[0]), Image.BICUBIC)
    return np.asarray(img, dtype=np.float32) / 255.0


def main():
    canvas = np.empty((SIZE, SIZE, 3), dtype=np.float32)
    canvas[:] = BASE

    # --- Nebula clouds: a few low-alpha tinted blobs of smooth noise. -------
    nebula_tints = [
        np.array([18, 26, 55], dtype=np.float32),   # cool blue
        np.array([40, 20, 48], dtype=np.float32),    # faint magenta
        np.array([30, 34, 30], dtype=np.float32),    # dim greenish-grey
        np.array([48, 32, 18], dtype=np.float32),    # faint warm amber
    ]
    for tint in nebula_tints:
        n = smooth_noise((SIZE, SIZE), scale=rng.integers(120, 220), gen=rng)
        # threshold + remap so clouds are patchy, not full-field
        n = np.clip((n - 0.45) / 0.55, 0.0, 1.0) ** 1.6
        alpha = (n * rng.uniform(0.20, 0.38))[..., None]
        canvas = canvas * (1 - alpha) + tint[None, None, :] * alpha

    # --- Star density field: uneven across the frame (no uniform scatter). --
    density = smooth_noise((SIZE, SIZE), scale=90, gen=rng)
    density = density ** 1.8  # bias toward sparse regions, with rich clumps

    # --- Place stars. Oversample candidates, accept by local density. -------
    n_candidates = 6000
    xs = rng.integers(0, SIZE, n_candidates)
    ys = rng.integers(0, SIZE, n_candidates)
    keep = rng.random(n_candidates) < (0.10 + 0.55 * density[ys, xs])
    xs, ys = xs[keep], ys[keep]
    n_stars = len(xs)

    # Per-star size: mostly 1px, some 2px, few 3-4px.
    size_roll = rng.random(n_stars)
    sizes = np.where(size_roll < 0.78, 1,
             np.where(size_roll < 0.95, 2,
             np.where(size_roll < 0.99, 3, 4)))

    # Per-star brightness (smaller stars dimmer on average).
    brightness = rng.uniform(0.35, 1.0, n_stars)
    brightness = np.clip(brightness + (sizes - 1) * 0.12, 0.2, 1.0)

    # Per-star color temperature: white-ish base, tinted blue or amber.
    temp = rng.random(n_stars)
    star_rgb = np.empty((n_stars, 3), dtype=np.float32)
    for i in range(n_stars):
        t = temp[i]
        if t < 0.60:        # white / neutral
            c = np.array([255, 252, 248])
        elif t < 0.82:      # faint blue
            c = np.array([200, 218, 255])
        elif t < 0.95:      # faint warm/amber
            c = np.array([255, 226, 188])
        else:               # cool steel blue (rarer)
            c = np.array([170, 190, 235])
        star_rgb[i] = c * brightness[i]

    # Additive blending so stars glow over the dark base (clamped later).
    for i in range(n_stars):
        s = int(sizes[i])
        x, y = int(xs[i]), int(ys[i])
        x0, x1 = max(0, x), min(SIZE, x + s)
        y0, y1 = max(0, y), min(SIZE, y + s)
        canvas[y0:y1, x0:x1, :] += star_rgb[i][None, None, :]
        # Soft halo for the brightest big stars.
        if s >= 3:
            hx0, hx1 = max(0, x - 1), min(SIZE, x + s + 1)
            hy0, hy1 = max(0, y - 1), min(SIZE, y + s + 1)
            canvas[hy0:hy1, hx0:hx1, :] += star_rgb[i][None, None, :] * 0.18

    out = np.clip(canvas, 0, 255).astype(np.uint8)
    rgba = np.dstack([out, np.full((SIZE, SIZE), 255, dtype=np.uint8)])

    here = os.path.dirname(os.path.abspath(__file__))
    dst = os.path.join(here, "..", "assets", "space_1.png")
    Image.fromarray(rgba).save(dst)
    print(f"wrote {os.path.normpath(dst)}  seed={SEED}  stars={n_stars}")


if __name__ == "__main__":
    main()
