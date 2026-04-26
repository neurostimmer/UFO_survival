// Canvas2D wrapper that mirrors the small p5/Game Lab drawing API the original
// game uses. State (fill color, text size, alignment) is module-scoped to match
// p5's "current pen" model — calls like fill('red') affect every subsequent
// text() until changed.

let ctx: CanvasRenderingContext2D | null = null;
let canvasW = 400;
let canvasH = 400;

let currentFill = '#ffffff';
let currentTextSize = 12;
let currentTextAlignH: CanvasTextAlign = 'left';
let currentTextBaseline: CanvasTextBaseline = 'alphabetic';

export function attachCanvas(canvas: HTMLCanvasElement): void {
  const c = canvas.getContext('2d');
  if (!c) throw new Error('Canvas2D context unavailable');
  ctx = c;
  canvasW = canvas.width;
  canvasH = canvas.height;
  // Game Lab text default approximates left/top-anchored top-left origin.
  ctx.textAlign = currentTextAlignH;
  ctx.textBaseline = currentTextBaseline;
}

export function getCtx(): CanvasRenderingContext2D {
  if (!ctx) throw new Error('renderer not attached — call attachCanvas first');
  return ctx;
}

export function getCanvasSize(): { width: number; height: number } {
  return { width: canvasW, height: canvasH };
}

export function background(color: string): void {
  const c = getCtx();
  c.save();
  c.fillStyle = color;
  c.fillRect(0, 0, canvasW, canvasH);
  c.restore();
}

export function fill(color: string): void {
  currentFill = color;
}

export function textSize(size: number): void {
  currentTextSize = size;
}

// PARITY: original game.code-org.js calls textAlign(LEFT, TOP) and
// textAlign(CENTER, CENTER). p5's vertical-align maps directly to canvas
// textBaseline except CENTER -> "middle".
export function textAlign(h: string, v?: string): void {
  currentTextAlignH = h as CanvasTextAlign;
  if (v !== undefined) {
    currentTextBaseline = (v === 'center' ? 'middle' : v) as CanvasTextBaseline;
  }
}

export function text(str: string, x: number, y: number): void {
  const c = getCtx();
  c.save();
  c.fillStyle = currentFill;
  c.font = `${currentTextSize}px sans-serif`;
  c.textAlign = currentTextAlignH;
  c.textBaseline = currentTextBaseline;
  c.fillText(str, x, y);
  c.restore();
}

export function rgb(r: number, g: number, b: number, a = 1): string {
  // Original passes a as 0..1 (matches p5 / CSS rgba). Clamp defensively.
  const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
  return `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${clamp01(a)})`;
}
