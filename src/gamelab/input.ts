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

// Mouse state
// mouseRaw mutates in real time from the DOM listeners; currentMouse is the per-tick snapshot

let mouseRawX = 0;
let mouseRawY = 0;
let mouseRawPressed = false;
let mouseJustPressedSinceTick = false;
let currentMouseX = 0;
let currentMouseY = 0;
let currentMousePressed = false;
let previousMousePressed = false;
let canvasEl: HTMLCanvasElement | null = null;

function updateMousePos(e: PointerEvent): void {
  if (!canvasEl) return;
  // Canvas may be CSS-scaled; map client coords to logical canvas pixels.
  const rect = canvasEl.getBoundingClientRect();
  const scaleX = canvasEl.width / rect.width;
  const scaleY = canvasEl.height / rect.height;
  mouseRawX = (e.clientX - rect.left) / scaleX;
  mouseRawY = (e.clientY - rect.top) / scaleY;
}

function onPointerMove(e: PointerEvent): void {
  updateMousePos(e);
}

function onPointerDown(e: PointerEvent): void {
  if (e.button !== 0) return; // left button only
  updateMousePos(e);
  mouseRawPressed = true;
  mouseJustPressedSinceTick = true;
}

function onPointerUp(e: PointerEvent): void {
  if (e.button !== 0) return;
  mouseRawPressed = false;
}

export function attachMouse(canvas: HTMLCanvasElement): void {
  if (canvasEl === canvas) return;
  canvasEl = canvas;
  canvas.addEventListener('pointermove', onPointerMove as EventListener);
  canvas.addEventListener('pointerup', onPointerUp as EventListener);
  canvas.addEventListener('pointerdown', onPointerDown as EventListener);
}

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
  currentMouseX = mouseRawX;
  currentMouseY = mouseRawY;
  previousMousePressed = currentMousePressed;
  currentMousePressed = mouseRawPressed || mouseJustPressedSinceTick;
  mouseJustPressedSinceTick = false;
}

export function keyDown(name: string): boolean {
  return currentTick.has(name.toLowerCase());
}

export function keyWentDown(name: string): boolean {
  const k = name.toLowerCase();
  return currentTick.has(k) && !previousTick.has(k);
}

export function mouseX(): number {
  return currentMouseX;
}

export function mouseY(): number {
  return currentMouseY;
}

export function mouseDown(): boolean {
  return currentMousePressed;
}

export function mouseWentDown(): boolean {
  return currentMousePressed && !previousMousePressed;
}

export function mouseOver(x: number, y: number, w: number, h: number): boolean {
  return currentMouseX >= x && currentMouseX < x + w && currentMouseY >= y && currentMouseY < y + h;
}

export function mouseClickedIn(x: number, y: number, w: number, h: number): boolean {
  return mouseWentDown() && mouseOver(x, y, w, h);
}

// Test-only seam.
export function _resetForTest(): void {
  pressed.clear();
  justPressedSinceTick.clear();
  currentTick = new Set();
  previousTick = new Set();
  mouseRawX = 0;
  mouseRawY = 0;
  mouseRawPressed = false;
  mouseJustPressedSinceTick = false;
  currentMouseX = 0;
  currentMouseY = 0;
  currentMousePressed = false;
  previousMousePressed = false;
  canvasEl = null;
}

// Test seams take a raw string (e.g. "ArrowUp", "c", " ") and skip the
// DOM event constructor — tests don't need jsdom/happy-dom for input logic.
export const _injectKeyDown = applyKeyDown;
export const _injectKeyUp = applyKeyUp;
export function _injectMouseMove(x: number, y: number): void {
  mouseRawX = x;
  mouseRawY = y;
}
export function _injectMouseDown(): void {
  mouseRawPressed = true;
  mouseJustPressedSinceTick = true;
}
export function _injectMouseUp(): void {
  mouseRawPressed = false;
}
