// Bootstrap: wire the canvas, install input listeners, preload every asset,
// arm the user-gesture audio unlock, then start the fixed-step game loop.

import { draw, init } from './game';
import {
  advanceSprites,
  attachCanvas,
  attachInput,
  createTickScheduler,
  preloadAssets,
  snapshotTick,
  unlockAudio,
} from './gamelab';

const TICK_MS = 1000 / 30; // 30 FPS — matches code.org Game Lab.
const MAX_CATCHUP_TICKS = 5; // After a hidden tab, drop excess catch-up ticks
//                              so the player isn't simulated to death.

async function main(): Promise<void> {
  const canvas = document.getElementById('game');
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('expected <canvas id="game"> in index.html');
  }
  attachCanvas(canvas);
  attachInput(window);

  await preloadAssets();

  // Chromium blocks AudioContext.start() until a user gesture. We register a
  // single-shot listener on both keydown and pointerdown so any first input
  // unlocks audio and drains queued playSound() calls.
  const unlock = (): void => {
    unlockAudio();
    window.removeEventListener('keydown', unlock);
    window.removeEventListener('pointerdown', unlock);
  };
  window.addEventListener('keydown', unlock);
  window.addEventListener('pointerdown', unlock);

  init();

  const scheduler = createTickScheduler({
    tickMs: TICK_MS,
    maxCatchupTicks: MAX_CATCHUP_TICKS,
  });
  let last = performance.now();
  const frame = (now: number): void => {
    const dt = now - last;
    last = now;
    const ticks = scheduler.advance(dt);
    for (let i = 0; i < ticks; i++) {
      snapshotTick();
      advanceSprites();
      draw();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

main().catch((err: unknown) => {
  // Surface bootstrap failures to the canvas so the page isn't silently blank.
  console.error('UFO Survival failed to start:', err);
  const canvas = document.getElementById('game');
  if (canvas instanceof HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#f33';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Failed to start. Open DevTools.', canvas.width / 2, canvas.height / 2);
    }
  }
});
