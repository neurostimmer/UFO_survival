import { describe, expect, it } from 'vitest';
import { createTickScheduler } from '../src/gamelab/scheduler';

const TICK = 1000 / 30; // 33.333...ms

describe('TickScheduler', () => {
  it('emits zero ticks for a sub-tick dt', () => {
    const s = createTickScheduler({ tickMs: TICK, maxCatchupTicks: 5 });
    expect(s.advance(TICK * 0.4)).toBe(0);
    expect(s.advance(TICK * 0.4)).toBe(0); // accumulator now 0.8 ticks
  });

  it('accumulates fractional dts and emits when threshold crossed', () => {
    const s = createTickScheduler({ tickMs: TICK, maxCatchupTicks: 5 });
    expect(s.advance(TICK * 0.6)).toBe(0); // acc 0.6
    expect(s.advance(TICK * 0.6)).toBe(1); // acc 1.2 -> 1 tick, leftover 0.2
    expect(s.accumulatorMs).toBeCloseTo(TICK * 0.2, 5);
  });

  it('emits multiple ticks when dt is large', () => {
    const s = createTickScheduler({ tickMs: TICK, maxCatchupTicks: 5 });
    expect(s.advance(TICK * 3.5)).toBe(3); // 3 ticks, 0.5 leftover
    expect(s.accumulatorMs).toBeCloseTo(TICK * 0.5, 5);
  });

  it('caps catch-up so a backgrounded tab cannot stampede the simulation', () => {
    const s = createTickScheduler({ tickMs: TICK, maxCatchupTicks: 5 });
    // Simulate a 30-second hidden tab.
    const ticks = s.advance(30_000);
    expect(ticks).toBe(5);
    // Accumulator must drain fully — leftover would carry stampede into next frame.
    expect(s.accumulatorMs).toBeCloseTo(0, 5);
  });

  it('catch-up cap respects the maxCatchupTicks setting', () => {
    const s = createTickScheduler({ tickMs: TICK, maxCatchupTicks: 2 });
    expect(s.advance(60_000)).toBe(2);
  });
});
