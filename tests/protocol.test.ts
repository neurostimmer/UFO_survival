import { describe, expect, it } from 'vitest';
import { decode, encodeInput, encodeSnapshot, type PlayerInput, type Snapshot } from '../src/net';

const sampleInput: PlayerInput = { up: true, left: false, right: true };

const sampleSnapshot: Snapshot = {
  phase: 'play',
  ufo1: { x: 100, y: 200 },
  ufo2: { x: 250, y: 80 },
  coin: { x: 150, y: 150, shown: true },
  blocks: [
    { x: 410, y: 120, anim: 3 },
    { x: -10, y: 300, anim: 17 },
  ],
  health: 9,
  points: 4,
  winCon: 25,
  difficulty: 2,
  count: 31,
  spawn: { dir: 1, x: 410, y: 120 },
};

describe('protocol: input round-trip', () => {
  it('encodes and decodes a PlayerInput losslessly', () => {
    const decoded = decode(encodeInput(sampleInput));
    expect(decoded).toEqual({ t: 'input', i: sampleInput });
  });

  it('preserves every button combination', () => {
    for (let bits = 0; bits < 8; bits++) {
      const input: PlayerInput = {
        up: Boolean(bits & 1),
        left: Boolean(bits & 2),
        right: Boolean(bits & 4),
      };
      expect(decode(encodeInput(input))).toEqual({ t: 'input', i: input });
    }
  });
});

describe('protocol: snapshot round-trip', () => {
  it('encodes and decodes a full Snapshot losslessly', () => {
    const decoded = decode(encodeSnapshot(sampleSnapshot));
    expect(decoded).toEqual({ t: 'snap', s: sampleSnapshot });
  });

  it('carries a null spawn (the between-cadence state)', () => {
    const snap: Snapshot = { ...sampleSnapshot, spawn: null, blocks: [] };
    const decoded = decode(encodeSnapshot(snap));
    expect(decoded).toEqual({ t: 'snap', s: snap });
  });

  it('round-trips each phase value', () => {
    for (const phase of ['play', 'win', 'over', 'wait'] as const) {
      const snap: Snapshot = { ...sampleSnapshot, phase };
      const decoded = decode(encodeSnapshot(snap));
      expect(decoded?.t === 'snap' && decoded.s.phase).toBe(phase);
    }
  });
});

describe('protocol: decode rejects malformed input', () => {
  it('returns null on non-JSON', () => {
    expect(decode('not json{')).toBeNull();
    expect(decode('')).toBeNull();
  });

  it('returns null on a JSON primitive or unknown tag', () => {
    expect(decode('42')).toBeNull();
    expect(decode('null')).toBeNull();
    expect(decode(JSON.stringify({ t: 'bogus' }))).toBeNull();
  });

  it('returns null when input fields are the wrong type', () => {
    expect(
      decode(JSON.stringify({ t: 'input', i: { up: 1, left: false, right: false } })),
    ).toBeNull();
    expect(decode(JSON.stringify({ t: 'input', i: { up: true } }))).toBeNull();
  });

  it('returns null on an invalid phase', () => {
    const bad = { ...sampleSnapshot, phase: 'paused' };
    expect(decode(JSON.stringify({ t: 'snap', s: bad }))).toBeNull();
  });

  it('returns null on an invalid spawn direction', () => {
    const bad = { ...sampleSnapshot, spawn: { dir: 5, x: 0, y: 0 } };
    expect(decode(JSON.stringify({ t: 'snap', s: bad }))).toBeNull();
  });

  it('returns null on a non-finite coordinate', () => {
    const bad = { ...sampleSnapshot, ufo1: { x: Number.NaN, y: 0 } };
    // NaN serializes to JSON null, which fails the numeric guard.
    expect(decode(JSON.stringify({ t: 'snap', s: bad }))).toBeNull();
  });

  it('returns null when a block entry is malformed', () => {
    const bad = { ...sampleSnapshot, blocks: [{ x: 1, y: 2 }] };
    expect(decode(JSON.stringify({ t: 'snap', s: bad }))).toBeNull();
  });

  it('returns null when blocks exceeds the safety cap', () => {
    const huge = Array.from({ length: 257 }, () => ({ x: 0, y: 0, anim: 0 }));
    const bad = { ...sampleSnapshot, blocks: huge };
    expect(decode(JSON.stringify({ t: 'snap', s: bad }))).toBeNull();
  });
});
