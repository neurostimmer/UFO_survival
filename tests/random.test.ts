import { describe, expect, it } from 'vitest';
import { randomNumber, setRandomSeed } from '../src/gamelab';

describe('randomNumber', () => {
  it('returns deterministic sequence for a given seed', () => {
    setRandomSeed(42);
    const a = [randomNumber(0, 100), randomNumber(0, 100), randomNumber(0, 100)];
    setRandomSeed(42);
    const b = [randomNumber(0, 100), randomNumber(0, 100), randomNumber(0, 100)];
    expect(a).toEqual(b);
    setRandomSeed(null); // restore
  });

  it('returns inclusive integers in [min, max]', () => {
    setRandomSeed(1);
    for (let i = 0; i < 1000; i++) {
      const n = randomNumber(5, 10);
      expect(n).toBeGreaterThanOrEqual(5);
      expect(n).toBeLessThanOrEqual(10);
      expect(Number.isInteger(n)).toBe(true);
    }
    setRandomSeed(null);
  });

  it('produces both endpoints across enough samples', () => {
    setRandomSeed(7);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(randomNumber(1, 4));
    expect(seen).toEqual(new Set([1, 2, 3, 4]));
    setRandomSeed(null);
  });
});
