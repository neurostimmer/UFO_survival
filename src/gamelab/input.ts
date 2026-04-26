// Edge-detected keyboard input.
//
// Two-buffer model: `pressed` tracks real-time held keys (mutated by the DOM
// listeners), `currentTick` and `previousTick` are snapshots taken once per
// simulation tick. keyDown() reads currentTick; keyWentDown() compares the
// two snapshots so an edge fires exactly once even if rAF advances multiple
// ticks in a single frame.
//
// `justPressedSinceTick` captures presses that happen-and-release inside one
// tick window so they're still visible for at least one tick — without it,
// a sub-frame tap is invisible to the game.

const pressed = new Set<string>();
const justPressedSinceTick = new Set<string>();
let currentTick: Set<string> = new Set();
let previousTick: Set<string> = new Set();

function normalize(key: string): string {
  if (key === ' ' || key === 'Spacebar') return 'space';
  if (key.startsWith('Arrow')) return key.slice(5).toLowerCase();
  // PARITY: original calls keyWentDown("C") with a literal uppercase. Browsers
  // emit "c" unshifted and "C" shifted. We lowercase both at storage time and
  // at lookup time so the behavior matches the original spec regardless of
  // the user's shift state.
  return key.toLowerCase();
}

function applyKeyDown(rawKey: string): void {
  const k = normalize(rawKey);
  pressed.add(k);
  justPressedSinceTick.add(k);
}

function applyKeyUp(rawKey: string): void {
  pressed.delete(normalize(rawKey));
}

function onKeyDown(e: KeyboardEvent): void {
  applyKeyDown(e.key);
}

function onKeyUp(e: KeyboardEvent): void {
  applyKeyUp(e.key);
}

let attached = false;

export function attachInput(target: Window | HTMLElement = window): void {
  if (attached) return;
  target.addEventListener('keydown', onKeyDown as EventListener);
  target.addEventListener('keyup', onKeyUp as EventListener);
  attached = true;
}

// Called once per simulation tick from the main loop.
export function snapshotTick(): void {
  previousTick = currentTick;
  currentTick = new Set(pressed);
  for (const k of justPressedSinceTick) currentTick.add(k);
  justPressedSinceTick.clear();
}

export function keyDown(name: string): boolean {
  return currentTick.has(name.toLowerCase());
}

export function keyWentDown(name: string): boolean {
  const k = name.toLowerCase();
  return currentTick.has(k) && !previousTick.has(k);
}

// Test-only seam.
export function _resetForTest(): void {
  pressed.clear();
  justPressedSinceTick.clear();
  currentTick = new Set();
  previousTick = new Set();
}

// Test seams take a raw string (e.g. "ArrowUp", "c", " ") and skip the
// DOM event constructor — tests don't need jsdom/happy-dom for input logic.
export const _injectKeyDown = applyKeyDown;
export const _injectKeyUp = applyKeyUp;
