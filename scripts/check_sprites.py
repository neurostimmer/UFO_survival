"""Inspect each sprite PNG and report transparency status.

Reports per-file: mode, has-alpha, palette-tRNS-present, and the alpha
of the four corner pixels (a quick proxy for "is the visible background
actually transparent"). Anything where corners are opaque is a sprite
that will render with a hard rectangle on a non-matching background.
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

ASSETS = Path(__file__).resolve().parent.parent / "assets"


def corner_alphas(img: Image.Image) -> tuple[int, int, int, int]:
    rgba = img.convert("RGBA")
    w, h = rgba.size
    pts = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    return tuple(rgba.getpixel(p)[3] for p in pts)


def main() -> int:
    files = sorted(ASSETS.glob("*.png"))
    if not files:
        print(f"no PNGs in {ASSETS}", file=sys.stderr)
        return 1

    print(f"{'file':<24} {'mode':<6} {'tRNS':<5} {'corner alphas (TL TR BL BR)'}")
    print("-" * 72)
    needs_fix: list[Path] = []
    for f in files:
        with Image.open(f) as im:
            mode = im.mode
            has_trns = "transparency" in im.info
            corners = corner_alphas(im)
        flag = " <-- opaque corners" if min(corners) == 255 else ""
        if min(corners) == 255:
            needs_fix.append(f)
        print(f"{f.name:<24} {mode:<6} {str(has_trns):<5} {corners}{flag}")

    print()
    if needs_fix:
        print(f"{len(needs_fix)} file(s) have opaque corners and likely need bg removal:")
        for f in needs_fix:
            print(f"  - {f.name}")
    else:
        print("all files have transparent corners")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
