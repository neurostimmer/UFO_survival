// Public barrel for the Game Lab compatibility shim. The game module imports
// from here; nothing else in src/game.ts should reach into individual shim
// files. This keeps the shim a single replaceable seam.

export { getAsset, knownAssetNames, preloadAssets } from './assets';
export { playSound, unlockAudio } from './audio';
export {
  _injectKeyDown,
  _injectKeyUp,
  _resetForTest,
  attachInput,
  keyDown,
  keyWentDown,
  snapshotTick,
} from './input';
export {
  attachCanvas,
  background,
  fill,
  getCanvasSize,
  rgb,
  text,
  textAlign,
  textSize,
} from './renderer';
export { createTickScheduler, type TickScheduler } from './scheduler';
export {
  _resetSprites,
  advanceSprites,
  createSprite,
  drawSprite,
  drawSprites,
  Sprite,
} from './sprite';

// Game Lab text-align constants. p5 exposes them as globals; we export them
// as string singletons whose values map to the underlying canvas API.
export const LEFT = 'left';
export const RIGHT = 'right';
export const CENTER = 'center';
export const TOP = 'top';
export const BOTTOM = 'bottom';

// Seedable RNG for deterministic tests. Set seed to null to fall back to
// Math.random() (default at runtime).
let rngState: number | null = null;

export function setRandomSeed(seed: number | null): void {
  rngState = seed;
}

function nextRandom(): number {
  if (rngState === null) return Math.random();
  // mulberry32
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// Inclusive integer in [min, max]. Matches code.org randomNumber.
export function randomNumber(min: number, max: number): number {
  return Math.floor(nextRandom() * (max - min + 1)) + min;
}
