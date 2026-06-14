import { describe, expect, it } from 'vitest';
import { randomNumber, setRandomSeed } from '../src/gamelab';
import { decode, encode, type NetMessage } from '../src/net';

const samples: NetMessage[] = [
  {
    t: 'start',
    seed: 12345,
    difficulty: 2,
    health: 10,
    points: 0,
    winCon: 25,
    coinX: 120,
    coinY: 300,
  },
  { t: 'pos', x: 150, y: 275 },
  { t: 'coin', x: 80, y: 90, points: 7 },
  { t: 'damage', health: 4 },
  { t: 'wait' },
];

describe('protocol: round-trip', () => {
  it('encodes and decodes every message type losslessly', () => {
    for (const msg of samples) {
      expect(decode(encode(msg))).toEqual(msg);
    }
  });
});

describe('protocol: decode rejects malformed frames', () => {
  it('returns null on non-JSON or a primitive', () => {
    expect(decode('not json{')).toBeNull();
    expect(decode('')).toBeNull();
    expect(decode('42')).toBeNull();
    expect(decode('null')).toBeNull();
  });

  it('returns null on an unknown tag', () => {
    expect(decode(JSON.stringify({ t: 'bogus' }))).toBeNull();
    expect(decode(JSON.stringify({ t: 'snap' }))).toBeNull();
  });

  it('returns null when a required field is missing or the wrong type', () => {
    expect(decode(JSON.stringify({ t: 'pos', x: 1 }))).toBeNull();
    expect(decode(JSON.stringify({ t: 'pos', x: '1', y: 2 }))).toBeNull();
    expect(decode(JSON.stringify({ t: 'damage' }))).toBeNull();
    expect(decode(JSON.stringify({ t: 'coin', x: 1, y: 2 }))).toBeNull();
    expect(
      decode(JSON.stringify({ t: 'start', seed: 1, difficulty: 1, health: 1, points: 1 })),
    ).toBeNull();
  });

  it('returns null on a non-finite number (NaN serializes to JSON null)', () => {
    expect(decode(JSON.stringify({ t: 'pos', x: Number.NaN, y: 0 }))).toBeNull();
  });
});

describe('determinism: a shared seed reproduces the same enemy stream', () => {
  // Mirrors what spawnBlock/decideNextSpawn draw each spawn: direction, a wall
  // coordinate, and a sprite index. Two clients seeded identically must produce
  // identical sequences — that's what lets enemies be generated locally on both
  // instead of streamed.
  function spawnSequence(seed: number, draws: number): number[] {
    setRandomSeed(seed);
    const out: number[] = [];
    for (let i = 0; i < draws; i++) {
      out.push(randomNumber(1, 4)); // direction
      out.push(randomNumber(10, 390)); // wall coordinate
      out.push(randomNumber(0, 20)); // sprite index
    }
    return out;
  }

  it('produces identical sequences for the same seed', () => {
    expect(spawnSequence(98765, 50)).toEqual(spawnSequence(98765, 50));
  });

  it('produces different sequences for different seeds', () => {
    expect(spawnSequence(1, 50)).not.toEqual(spawnSequence(2, 50));
  });
});
