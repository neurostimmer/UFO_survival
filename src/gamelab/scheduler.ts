// Fixed-step tick scheduler. Pure (no DOM, no rAF). The main loop feeds it
// elapsed wall-clock milliseconds; it returns how many simulation ticks
// should run this frame, with catch-up clamped so a backgrounded tab doesn't
// stampede the simulation on return.

export interface TickScheduler {
  /** Add `dtMs` to the accumulator and return how many ticks should run now. */
  advance(dtMs: number): number;
  /** Internal accumulator value, exposed for tests. */
  readonly accumulatorMs: number;
}

export function createTickScheduler(opts: {
  tickMs: number;
  maxCatchupTicks: number;
}): TickScheduler {
  const { tickMs, maxCatchupTicks } = opts;
  let acc = 0;
  return {
    advance(dtMs: number): number {
      acc += dtMs;
      let count = 0;
      while (acc >= tickMs && count < maxCatchupTicks) {
        count++;
        acc -= tickMs;
      }
      // If the cap was hit and time remains, drop the leftover so a
      // backgrounded tab can't stampede the simulation across future frames.
      // Counting ticks inside the loop (instead of pre-clamping the
      // accumulator) avoids IEEE-754 rounding biting the cap.
      if (count >= maxCatchupTicks && acc >= tickMs) {
        acc = 0;
      }
      return count;
    },
    get accumulatorMs(): number {
      return acc;
    },
  };
}
