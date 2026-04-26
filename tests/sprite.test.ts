import { describe, expect, it } from 'vitest';
import { Sprite } from '../src/gamelab';

// Sprite uses center-anchored bounding boxes (p5.play parity). Every test here
// constructs sprites with explicit width/height and skips setAnimation so no
// DOM/Image is needed.

describe('Sprite.isTouching', () => {
  it('returns true when bounding boxes overlap', () => {
    const a = new Sprite(100, 100, 40, 40);
    const b = new Sprite(110, 100, 40, 40);
    expect(a.isTouching(b)).toBe(true);
  });

  it('returns false when boxes are disjoint', () => {
    const a = new Sprite(100, 100, 40, 40);
    const b = new Sprite(200, 100, 40, 40);
    expect(a.isTouching(b)).toBe(false);
  });

  it('returns false when boxes touch on an edge (strict overlap)', () => {
    // a covers [80,120] horizontally; b covers [120,160]. Edges meet at x=120.
    const a = new Sprite(100, 100, 40, 40);
    const b = new Sprite(140, 100, 40, 40);
    expect(a.isTouching(b)).toBe(false);
  });

  it('respects scale on the bounding box', () => {
    const a = new Sprite(100, 100, 40, 40);
    a.scale = 2; // effective 80x80, covering [60,140]
    const b = new Sprite(150, 100, 40, 40); // covers [130,170]
    expect(a.isTouching(b)).toBe(true);
  });

  it('a destroyed sprite is never touching anything', () => {
    const a = new Sprite(100, 100, 40, 40);
    const b = new Sprite(110, 100, 40, 40);
    expect(a.isTouching(b)).toBe(true);
    a.destroy();
    expect(a.isTouching(b)).toBe(false);
    expect(b.isTouching(a)).toBe(false);
  });

  it('vertical-only overlap is detected', () => {
    const a = new Sprite(100, 100, 40, 40);
    const b = new Sprite(100, 130, 40, 40);
    expect(a.isTouching(b)).toBe(true);
  });
});
