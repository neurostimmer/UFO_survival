// Wire protocol for online co-op.
//
// The host is authoritative: the guest sends its held controls (PlayerInput)
// and the host broadcasts the full render state (Snapshot) every tick. v1
// encodes as JSON — the payloads are tiny (two ships, a coin, a handful of
// blocks) so at 30 Hz this is only a few KB/s. encode/decode are the ONLY
// place that knows the wire format, so swapping to a packed binary layout
// later changes nothing else.
//
// decode() is defensive: a DataChannel is peer-to-peer but still untrusted, so
// every field is validated and any malformed frame returns null rather than
// throwing into the render loop.

// A player's controls for one tick — all HELD states, no edge flags. Sending
// held state over an unreliable channel is robust: a dropped or reordered
// packet costs at most one tick of latency, and the host derives the jump edge
// itself from the rising edge of `up`. Latest-wins.
export interface PlayerInput {
  up: boolean;
  left: boolean;
  right: boolean;
}

// One enemy block as the guest needs to draw it. Direction/velocity live only
// on the host; the guest just paints the sprite at (x,y) with animation index
// `anim` (0..20 into the 21 retroship animations).
export interface BlockSnap {
  x: number;
  y: number;
  anim: number;
}

// Which screen the guest should render. The guest runs no simulation, so the
// host tells it whether it's in gameplay or on a win/lose/waiting overlay.
export type Phase = 'play' | 'win' | 'over' | 'wait';

export interface SpawnSnap {
  dir: 1 | 2 | 3 | 4;
  x: number;
  y: number;
}

export interface Snapshot {
  phase: Phase;
  ufo1: { x: number; y: number };
  ufo2: { x: number; y: number };
  coin: { x: number; y: number; shown: boolean };
  blocks: BlockSnap[];
  health: number;
  points: number;
  winCon: number;
  difficulty: number;
  count: number;
  spawn: SpawnSnap | null;
}

export type NetMessage = { t: 'input'; i: PlayerInput } | { t: 'snap'; s: Snapshot };

// Defensive upper bound on block count so a malformed frame can't make the
// guest allocate unboundedly. Real gameplay never approaches this.
const MAX_BLOCKS = 256;

export function encodeInput(i: PlayerInput): string {
  const msg: NetMessage = { t: 'input', i };
  return JSON.stringify(msg);
}

export function encodeSnapshot(s: Snapshot): string {
  const msg: NetMessage = { t: 'snap', s };
  return JSON.stringify(msg);
}

export function decode(raw: string): NetMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  if (parsed.t === 'input') {
    const i = parseInput(parsed.i);
    return i ? { t: 'input', i } : null;
  }
  if (parsed.t === 'snap') {
    const s = parseSnapshot(parsed.s);
    return s ? { t: 'snap', s } : null;
  }
  return null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function num(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function bool(v: unknown): v is boolean {
  return typeof v === 'boolean';
}

function parseInput(v: unknown): PlayerInput | null {
  if (!isRecord(v) || !bool(v.up) || !bool(v.left) || !bool(v.right)) return null;
  return { up: v.up, left: v.left, right: v.right };
}

function parseXY(v: unknown): { x: number; y: number } | null {
  if (!isRecord(v) || !num(v.x) || !num(v.y)) return null;
  return { x: v.x, y: v.y };
}

function parseSpawn(v: unknown): SpawnSnap | null {
  if (!isRecord(v)) return null;
  const dir = v.dir;
  if (dir !== 1 && dir !== 2 && dir !== 3 && dir !== 4) return null;
  if (!num(v.x) || !num(v.y)) return null;
  return { dir, x: v.x, y: v.y };
}

function parseSnapshot(v: unknown): Snapshot | null {
  if (!isRecord(v)) return null;

  const phase = v.phase;
  if (phase !== 'play' && phase !== 'win' && phase !== 'over' && phase !== 'wait') return null;

  const ufo1 = parseXY(v.ufo1);
  const ufo2 = parseXY(v.ufo2);
  if (!ufo1 || !ufo2) return null;

  if (!isRecord(v.coin) || !num(v.coin.x) || !num(v.coin.y) || !bool(v.coin.shown)) return null;

  if (!Array.isArray(v.blocks) || v.blocks.length > MAX_BLOCKS) return null;
  const blocks: BlockSnap[] = [];
  for (const b of v.blocks) {
    if (!isRecord(b) || !num(b.x) || !num(b.y) || !num(b.anim)) return null;
    blocks.push({ x: b.x, y: b.y, anim: b.anim });
  }

  if (!num(v.health) || !num(v.points) || !num(v.winCon) || !num(v.difficulty) || !num(v.count)) {
    return null;
  }

  // spawn is legitimately null between cadence windows; only a non-null,
  // malformed spawn is a decode failure.
  let spawn: SpawnSnap | null = null;
  if (v.spawn !== null) {
    spawn = parseSpawn(v.spawn);
    if (!spawn) return null;
  }

  return {
    phase,
    ufo1,
    ufo2,
    coin: { x: v.coin.x, y: v.coin.y, shown: v.coin.shown },
    blocks,
    health: v.health,
    points: v.points,
    winCon: v.winCon,
    difficulty: v.difficulty,
    count: v.count,
    spawn,
  };
}
