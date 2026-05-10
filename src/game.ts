// UFO Survival — TypeScript port of original/game.code-org.js.
//
// Structure: a state machine driven by `difficulty` (-2 title, -1 select,
// 1/2/3 gameplay) plus health/points overlays for game-over and win.
// Each screen is its own function so any one can be rebuilt without
// disturbing the others.
//
// PARITY-tagged comments mark intentional preservation of original quirks.
// Do not "fix" any of them until the port is signed off as visually identical
// to the code.org page; then queue them as labeled follow-ups.

import {
  background,
  CENTER,
  createSprite,
  drawSprite,
  drawSprites,
  fill,
  fillRadialGradient,
  keyDown,
  keyWentDown,
  LEFT,
  playSound,
  randomNumber,
  rect,
  rgb,
  type Sprite,
  TOP,
  text,
  textAlign,
  textSize,
} from './gamelab';

// Persistent sprites — created once in init().
let backGround!: Sprite;
let UFO1!: Sprite;
let UFO2!: Sprite;
let coin!: Sprite;

let blocks: Sprite[] = [];

let count = 0;
let health = 10;
let points = 0;
let coinExists = false;
let difficulty = -2;
let winCon = 25;
// PARITY: 1 = single-player, 3 = two-player. The value 2 is intentionally
// unused in the original; restart and damage logic check `players > 2`.
let players = 1;

const shipAnimations: string[] = [];
for (let i = 1; i <= 21; i++) {
  shipAnimations.push(i < 10 ? `retroship_0${i}_1` : `retroship_${i}_1`);
}

// Title-screen preview icons. Created lazily on first title render; destroyed
// on transition out. The original game has no path back to the title screen,
// so these never need to be recreated mid-session.
let UFOIcon: Sprite | null = null;
let UFO2Icon: Sprite | null = null;
let coinIcon: Sprite | null = null;
let enemyIcon: Sprite | null = null;

// Spawn telegraph. The next enemy's direction and target coords are decided
// one cadence-window in advance so drawSpawnIndicator() can paint a warning
// red bar on the wall it'll come through.
type SpawnTarget = { direction: 1 | 2 | 3 | 4; x: number; y: number };
let nextSpawn: SpawnTarget | null = null;

const FIELD = 400;
// Gaussian indicator. The marker is a 2D radial Gaussian anchored at the
// wall-coord nearest the spawn point — the half outside the canvas is
// naturally clipped, so what's visible is the "edge-bright, fades into the
// field along the direction of travel" shape. σ shrinks across the entire
// countdown (no phase split) until the Gaussian collapses to a near-point
// right as the enemy enters. Peak alpha simultaneously ramps from a moderate
// pop-in value to fully opaque, compensating the dramatic area shrink so
// the marker stays perceptible even as it tightens.
const SIGMA_INITIAL = 25; // 2σ ≈ 50 px → matches "±50 px from spawn point"
const SIGMA_FINAL = 2; // near-point collapse at moment of spawn
const ALPHA_PEAK_INITIAL = 0.5;
const ALPHA_PEAK_FINAL = 1.0;
const GAUSSIAN_RADIUS_SIGMAS = 3; // outer gradient radius in σ units (~99.7%)

export function init(): void {
  backGround = createSprite(200, 200, 400, 400);
  backGround.setAnimation('space_1');
  // PARITY: original passes 0.1 as both width and height — nonsensical, but
  // setAnimation immediately overrides those with the loaded image's natural
  // size, so the values never matter.
  UFO1 = createSprite(100, 200, 0.1, 0.1);
  UFO2 = createSprite(100, 200, 0.1, 0.1);
  UFO1.scale = 0.1;
  UFO2.scale = 0.1;
  coin = createSprite(-100, -100);

  // Music. The audio shim queues this until the first user gesture unlocks
  // the AudioContext (Chromium autoplay policy).
  playSound('sound://category_music/clear_evidence_loop1.mp3', true);
}

export function draw(): void {
  if (health > 0 && points < winCon && difficulty > 0) {
    drawGameplay();
  } else {
    drawNonGameplay();
  }
}

function drawGameplay(): void {
  // Pre-roll the very first spawn on entry to gameplay so the indicator is
  // already on screen for frame 1 — same telegraph treatment as every later
  // enemy.
  if (!nextSpawn) decideNextSpawn();

  backGround.setAnimation('space_1');
  UFO1.setAnimation('ufo_1');
  UFO2.setAnimation('ufo_2');

  if (keyWentDown('up')) UFO1.velocityY = -12;
  if (keyWentDown('w')) UFO2.velocityY = -12;

  UFO1.velocityX = 0;
  UFO2.velocityX = 0;
  if (keyDown('left')) UFO1.velocityX = -5;
  if (keyDown('right')) UFO1.velocityX = 5;
  if (keyDown('a')) UFO2.velocityX = -5;
  if (keyDown('d')) UFO2.velocityX = 5;

  UFO2.velocityY += 1.5;
  UFO1.velocityY += 1.5;

  // Draw order: background → indicator (under sprites so the player can fly
  // over it) → all other sprites → HUD. drawSprites() would redraw the
  // background and clobber the indicator, so we drawSprite each non-bg
  // sprite manually instead.
  drawSprite(backGround);
  drawSpawnIndicator();
  drawSprite(UFO1);
  drawSprite(UFO2);
  drawSprite(coin);
  for (const b of blocks) drawSprite(b);

  textSize(20);
  fill('red');
  text(`Health: ${health}`, 300, 20);
  fill('green');
  text(`Points: ${points}`, 300, 50);

  count++;

  // Spawn cadence: 75 frames easy, 50 normal, 25 hard.
  if (count === 100 - difficulty * 25) {
    spawnBlock();
    count = 0;
  }

  if (!coinExists) {
    coin.setAnimation('coin');
    coin.y = randomNumber(50, 350);
    coin.x = randomNumber(50, 350);
    coinExists = true;
    coin.scale = 0.4;
  }

  if (UFO1.isTouching(coin) || (UFO2.isTouching(coin) && players === 3)) {
    points++;
    coinExists = false;
    coin.y = 500;
  }

  //Fixed an issue where offscreened blocks were only cleared when going downward
  for (let i = blocks.length - 1; i >= 0; i--) {
    const currentBlock = blocks[i];
    if (
      currentBlock &&
      (currentBlock.x < -10 || currentBlock.x > 410 || currentBlock.y < -10 || currentBlock.y > 410)
    ) {
      currentBlock.destroy();
      blocks.splice(i, 1);
    }
  }

  // Wall damage. P1 always; P2 only in 2P (`players === 3`).
  if (UFO1.y < 0 || UFO1.y > 400 || UFO1.x < 0 || UFO1.x > 400) {
    handleDamage();
  }
  if ((UFO2.y < 0 || UFO2.y > 400 || UFO2.x < 0 || UFO2.x > 400) && players === 3) {
    handleDamage();
  }

  // Block-collision damage. JS precedence in the original makes this:
  //   UFO1.isTouching(b)  ||  (UFO2.isTouching(b) && players == 3)
  // (`&&` binds tighter than `||`). Parens added here for clarity but
  // semantics are unchanged.
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b && (UFO1.isTouching(b) || (UFO2.isTouching(b) && players === 3))) {
      handleDamage();
    }
  }
}

// Pre-rolls direction + entry coords for the next spawn. Called at gameplay
// entry (so the first enemy gets the same telegraph as all subsequent ones)
// and at the end of every spawnBlock() to set up the *following* spawn.
function decideNextSpawn(): void {
  const direction = randomNumber(1, 4) as 1 | 2 | 3 | 4;
  let x = 0;
  let y = 0;
  if (direction === 1) {
    x = 410;
    y = randomNumber(10, 390);
  } else if (direction === 2) {
    x = randomNumber(10, 390);
    y = 410;
  } else if (direction === 3) {
    x = -10;
    y = randomNumber(10, 390);
  } else {
    x = randomNumber(10, 390);
    y = -10;
  }
  nextSpawn = { direction, x, y };
}

function spawnBlock(): void {
  if (!nextSpawn) decideNextSpawn();
  const target = nextSpawn as SpawnTarget;

  const newBlock = createSprite(target.x, target.y);
  newBlock.direction = target.direction;
  newBlock.scale = 0.2;
  if (target.direction === 1) newBlock.velocityX = -5;
  else if (target.direction === 2) newBlock.velocityY = -5;
  else if (target.direction === 3) newBlock.velocityX = 5;
  else newBlock.velocityY = 5;

  const randomIndex = randomNumber(0, shipAnimations.length - 1);
  const name = shipAnimations[randomIndex];
  if (name) newBlock.setAnimation(name);
  blocks.push(newBlock);

  decideNextSpawn();
}

// Single-curve interp for the Gaussian marker. Pure: returns σ and peak α at
// a progress value t in [0,1] where 0 = just spawned, 1 = about to spawn.
// Ease-in (t²) so most of the contraction-and-intensify happens late — the
// marker visibly collapses into the spawn point right as the enemy appears.
function indicatorState(t: number): { sigma: number; alphaPeak: number } {
  const ease = t * t;
  return {
    sigma: SIGMA_INITIAL + (SIGMA_FINAL - SIGMA_INITIAL) * ease,
    alphaPeak: ALPHA_PEAK_INITIAL + (ALPHA_PEAK_FINAL - ALPHA_PEAK_INITIAL) * ease,
  };
}

// Builds gradient stops that sample a 2D Gaussian along the radial axis of a
// canvas radial gradient. Offset 0 = peak (r=0). Offset 1 = outer circle at
// r = GAUSSIAN_RADIUS_SIGMAS·σ (~0.011 of peak — the natural Gaussian tail).
// We force the offset=1 stop to alpha 0 so canvas pixels outside the outer
// circle don't pick up that residual tint over the whole rect.
function gaussianStops(peakAlpha: number): Array<[number, string]> {
  const N = 10;
  const stops: Array<[number, string]> = [];
  for (let i = 0; i < N; i++) {
    const offset = i / N;
    const distInSigma = offset * GAUSSIAN_RADIUS_SIGMAS;
    const a = peakAlpha * Math.exp(-(distInSigma * distInSigma) / 2);
    stops.push([offset, `rgba(255, 0, 0, ${a.toFixed(3)})`]);
  }
  stops.push([1, 'rgba(255, 0, 0, 0)']);
  return stops;
}

function drawSpawnIndicator(): void {
  if (!nextSpawn) return;
  const cadence = 100 - difficulty * 25;
  const t = Math.min(1, count / cadence);
  const { sigma, alphaPeak } = indicatorState(t);
  const stops = gaussianStops(alphaPeak);
  const radius = GAUSSIAN_RADIUS_SIGMAS * sigma;
  const { direction, x: tx, y: ty } = nextSpawn;

  // Anchor the Gaussian on the wall coordinate (not the spawn x/y, which is
  // 10 px outside the canvas). Half of the Gaussian falls outside the
  // canvas and is clipped — the visible half shows the edge-bright fade
  // into the field along the direction of travel.
  let cx: number;
  let cy: number;
  if (direction === 1) {
    cx = FIELD;
    cy = ty;
  } else if (direction === 2) {
    cx = tx;
    cy = FIELD;
  } else if (direction === 3) {
    cx = 0;
    cy = ty;
  } else {
    cx = tx;
    cy = 0;
  }

  fillRadialGradient(cx, cy, radius, stops);
  rect(0, 0, FIELD, FIELD);
}

function drawNonGameplay(): void {
  if (health === 0) {
    drawGameOver();
  } else if (points === winCon) {
    drawWin();
  } else if (difficulty === -1) {
    drawDifficultySelect();
  } else if (difficulty === -2) {
    drawTitle();
  }

  // R-restart works from any non-gameplay state.
  if (keyWentDown('r')) {
    // PARITY: original sets health = 11 (one extra HP after restart).
    health = 11;
    points = 0;
    UFO1.y = 600;
    UFO1.velocityY = 0;
    UFO1.velocityX = 0;
    if (players > 2) {
      UFO2.y = 600;
      UFO2.velocityY = 0;
      UFO2.velocityX = 0;
    }
    background(rgb(255, 0, 0, 0.5));
    winCon = 25;
    for (const b of blocks) b.destroy();
    blocks = [];
    nextSpawn = null;
    difficulty = -1;
  }
}

function drawGameOver(): void {
  background('black');
  fill('red');
  textSize(70);
  textAlign(CENTER, CENTER);
  text('Game Over!', 200, 150);
  textSize(20);
  text(`Your score: ${points}`, 200, 250);
  // PARITY: original has x = 199 (typo — every other label uses 200).
  text('press R to restart', 199, 300);
}

function drawWin(): void {
  fill('green');
  textSize(70);
  textAlign(CENTER, CENTER);
  text('You Win!', 200, 150);
  textSize(20);
  text(`Final Health: ${health}`, 200, 250);
  text('press C to keep going!', 200, 275);
  // PARITY: original is keyWentDown("C") with literal uppercase. The input
  // shim lowercases internally so this matches both shifted and unshifted C.
  if (keyWentDown('C')) {
    winCon += 25;
    health++;
    handleDamage();
  }
}

function drawDifficultySelect(): void {
  textAlign(LEFT, CENTER);
  backGround.setAnimation('space_1');
  fill('white');
  drawSprites();
  textSize(50);
  text('Select difficulty:', 20, 100);
  textSize(20);
  fill('green');
  text('press 1 for easy', 100, 150);
  fill('yellow');
  text('press 2 for normal', 100, 200);
  fill('red');
  text('press 3 for hard', 100, 250);
  fill('white');
  textSize(15);
  text('Game designed and coded by Hyrum Adams', 50, 300);
  if (players === 1) {
    // PARITY: 1P mode parks UFO2 far offscreen so drawSprites doesn't render it.
    UFO2.y = -10000;
  }
  if (keyWentDown('1')) difficulty = 1;
  if (keyWentDown('2')) difficulty = 2;
  if (keyWentDown('3')) difficulty = 3;
}

function drawTitle(): void {
  background('black');
  textAlign(LEFT, TOP);
  textSize(40);
  fill('white');
  text('🚀 UFO Survival', 60, 30);

  if (!UFOIcon) {
    UFOIcon = createSprite(50, 160);
    UFOIcon.setAnimation('ufo_1');
    UFOIcon.scale = 0.08;
  }
  if (!UFO2Icon) {
    UFO2Icon = createSprite(50, 190);
    UFO2Icon.setAnimation('ufo_2');
    UFO2Icon.scale = 0.08;
  }
  if (!coinIcon) {
    coinIcon = createSprite(50, 250);
    coinIcon.setAnimation('coin');
    coinIcon.scale = 0.4;
  }
  if (!enemyIcon) {
    enemyIcon = createSprite(50, 220);
    enemyIcon.setAnimation('retroship_02_1');
    enemyIcon.scale = 0.08;
  }

  textSize(20);
  fill('lightblue');
  text('Controls:', 50, 120);
  fill('white');
  text('- Arrow keys to move (1st player)', 70, 150);
  text('- Use WASD to move (2nd player)', 70, 180);
  text('- Avoid enemy ships!', 70, 210);
  text('- Collect coins for points', 70, 240);
  text('- If your health reaches 0, you lose.', 70, 270);

  fill('yellow');
  text(`Goal: Get ${winCon} points to win!`, 60, 310);

  fill('orange');
  textSize(18);
  text('Press SPACE for one player', 70, 350);
  text('Press BACKSPACE for two player!', 50, 370);

  // Capture locals after lazy-init so TS narrowing survives across the
  // remaining draw/destroy calls.
  const ufo1Ico = UFOIcon;
  const ufo2Ico = UFO2Icon;
  const coinIco = coinIcon;
  const enemyIco = enemyIcon;

  drawSprite(ufo1Ico);
  drawSprite(ufo2Ico);
  drawSprite(coinIco);
  drawSprite(enemyIco);
  // PARITY: original calls drawSprite(this.healthIcon) but healthIcon is never
  // created, so the call does nothing in code.org. Omitted here.

  if (keyWentDown('space')) {
    ufo1Ico.destroy();
    ufo2Ico.destroy();
    coinIco.destroy();
    enemyIco.destroy();
    UFOIcon = UFO2Icon = coinIcon = enemyIcon = null;
    difficulty = -1;
  }
  if (keyWentDown('backspace')) {
    ufo1Ico.destroy();
    ufo2Ico.destroy();
    coinIco.destroy();
    enemyIco.destroy();
    UFOIcon = UFO2Icon = coinIcon = enemyIcon = null;
    difficulty = -1;
    // PARITY: 2P mode is encoded as players === 3 (skipping 2 entirely).
    players = 3;
  }
}

function handleDamage(): void {
  health--;
  UFO1.y = 200;
  UFO1.x = 200;
  UFO1.velocityY = -15;
  if (players > 2) {
    UFO2.y = 200;
    UFO2.x = 200;
    UFO2.velocityY = -15;
  }
  background(rgb(255, 0, 0, 0.5));
  for (const b of blocks) b.destroy();
  blocks = [];
}
