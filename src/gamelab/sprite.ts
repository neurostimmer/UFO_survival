// Sprite class + global registry.
//
// p5.play / Game Lab anchors sprites at their CENTER (not top-left). The
// effective rendered footprint is (baseWidth * scale) x (baseHeight * scale).
// Once setAnimation() is called, baseWidth/baseHeight track the loaded image
// dimensions; before that they fall back to the constructor args (which the
// original game often passes as nonsense like 0.1 because it always calls
// setAnimation immediately after — see PARITY note below).

import { getAsset } from './assets';
import { getCtx } from './renderer';

let nextId = 0;
const allSprites: Sprite[] = [];

export class Sprite {
  readonly id: number;
  x: number;
  y: number;
  scale = 1;
  velocityX = 0;
  velocityY = 0;
  // Custom user property — the original game stores spawn direction (1..4) here.
  // Not a p5.play built-in field for motion.
  direction = 0;

  destroyed = false;

  private baseWidth: number;
  private baseHeight: number;
  private animation: HTMLImageElement | null = null;

  constructor(x: number, y: number, width = 100, height = 100) {
    this.id = nextId++;
    this.x = x;
    this.y = y;
    this.baseWidth = width;
    this.baseHeight = height;
  }

  setAnimation(name: string): void {
    const img = getAsset(name);
    this.animation = img;
    // PARITY: matches Game Lab behavior — sprite footprint snaps to the
    // image's natural size, overriding whatever the constructor was given.
    this.baseWidth = img.naturalWidth;
    this.baseHeight = img.naturalHeight;
  }

  destroy(): void {
    this.destroyed = true;
  }

  get width(): number {
    return this.baseWidth * this.scale;
  }

  get height(): number {
    return this.baseHeight * this.scale;
  }

  isTouching(other: Sprite): boolean {
    if (this.destroyed || other.destroyed) return false;
    const ax1 = this.x - this.width / 2;
    const ay1 = this.y - this.height / 2;
    const ax2 = this.x + this.width / 2;
    const ay2 = this.y + this.height / 2;
    const bx1 = other.x - other.width / 2;
    const by1 = other.y - other.height / 2;
    const bx2 = other.x + other.width / 2;
    const by2 = other.y + other.height / 2;
    return ax1 < bx2 && ax2 > bx1 && ay1 < by2 && ay2 > by1;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.destroyed) return;
    if (!this.animation) {
      // Visible placeholder so missing-animation bugs are obvious.
      ctx.save();
      ctx.fillStyle = '#ff00ff';
      ctx.fillRect(this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
      ctx.restore();
      return;
    }
    ctx.drawImage(
      this.animation,
      this.x - this.width / 2,
      this.y - this.height / 2,
      this.width,
      this.height,
    );
  }
}

// Apply velocity to every live sprite. Called once per tick from main.ts,
// before game.draw() runs. Matches p5.play's pre-draw position update so the
// original tuning (gravity 1.5/frame, jump -12) reads identically.
export function advanceSprites(): void {
  for (const s of allSprites) {
    if (s.destroyed) continue;
    s.x += s.velocityX;
    s.y += s.velocityY;
  }
}

export function createSprite(x: number, y: number, width = 100, height = 100): Sprite {
  const s = new Sprite(x, y, width, height);
  allSprites.push(s);
  return s;
}

export function drawSprite(s: Sprite): void {
  s.draw(getCtx());
}

export function drawSprites(): void {
  const ctx = getCtx();
  for (const s of allSprites) s.draw(ctx);
  // Lazy GC: reap destroyed entries here so the registry doesn't grow unbounded.
  for (let i = allSprites.length - 1; i >= 0; i--) {
    const s = allSprites[i];
    if (s?.destroyed) allSprites.splice(i, 1);
  }
}

// Test-only seam.
export function _resetSprites(): void {
  allSprites.length = 0;
  nextId = 0;
}
