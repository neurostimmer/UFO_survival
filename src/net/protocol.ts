// Wire protocol for online co-op (deterministic / event-driven).
//
// Both clients run the SAME simulation: enemies are generated locally from a
// shared seed (so they never travel over the wire), and each player runs their
// OWN ship from local input — zero input lag, symmetrically. Only two kinds of
// data cross the wire:
//   1. each player's position (`pos`), so the other ship can be drawn; and
//   2. the handful of host-authoritative events that touch shared state and the
//      RNG — match (re)starts, coin pickups, damage, and the guest-wait signal —
//      because those depend on BOTH ships and so can't be derived independently.
//
// decode() is defensive: every field is validated and a malformed frame returns
// null rather than throwing into the render loop.

// Host → guest. Begins (or, on a win-continue, re-syncs) a match: both sides
// seed their RNG identically and reset to the same starting state. `mode`
// selects co-op (shared HP/points, host-authoritative coins/damage) vs compete
// (per-player HP/coins; each client runs its own ship/coin, host arbitrates only
// the win/loss outcome). In compete, `health` is the starting HP and `winCon`
// is the coin goal both players were configured with.
export interface StartMsg {
  t: 'start';
  mode: 'coop' | 'compete';
  seed: number;
  difficulty: number;
  health: number;
  points: number;
  winCon: number;
  coinX: number;
  coinY: number;
}

// Either direction, every tick: the sender's own ship position and current
// velocity. Velocity lets the receiver dead-reckon the remote ship forward to
// hide ½-RTT lag (?smooth=1); it's ignored when smoothing is off. `hp`/`coins`
// carry the sender's own counters — meaningful in compete (the receiver draws
// them as the opponent's HUD and the host arbitrates win/loss from them);
// redundant but harmless in co-op, where HP/points are shared.
export interface PosMsg {
  t: 'pos';
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  coins: number;
}

// Host → guest: a coin was collected (by either ship). Carries the new score
// and the next coin position (coins are host-authoritative, not seeded, because
// who grabs one depends on both ships).
export interface CoinMsg {
  t: 'coin';
  x: number;
  y: number;
  points: number;
}

// Host → guest: damage was taken (by either ship). Both clear the field and
// respawn their own ship; health is authoritative.
export interface DamageMsg {
  t: 'damage';
  health: number;
}

// Host → guest: the host left gameplay (restart to difficulty select). The
// guest shows "waiting for host" until the next start.
export interface WaitMsg {
  t: 'wait';
}

// Host → guest, compete only: the host has decided the match outcome (someone
// hit the coin goal or dropped to 0 HP). Carries the winner and the session win
// tally for both players so both ends render the same match-end screen. The
// host is the sole arbiter so the two clients can't disagree under ½-RTT.
export interface ResultMsg {
  t: 'result';
  winner: 'host' | 'guest';
  hostWins: number;
  guestWins: number;
}

// Guest → host, debug only (?debug=1 on the host). A periodic digest of the
// guest's sim state so the host can render a desync log on one screen instead of
// diffing two browser consoles. `sigN`/`sigDir`/`sigSprite` are the guest's
// most-recent spawn signature (ordinal + the two seeded draws that define the
// enemy) — comparing them against the host's own record of spawn #sigN is the
// latency-independent test of whether the shared seed actually stayed in sync.
export interface DiagMsg {
  t: 'diag';
  tick: number; // sender's online-frame counter since match start
  spawns: number; // total enemies spawned so far
  sigN: number; // ordinal of the most recent spawn (-1 if none yet)
  sigDir: number; // that spawn's direction draw
  sigSprite: number; // that spawn's sprite-index draw
  coinX: number;
  coinY: number;
  points: number;
  health: number;
}

export type NetMessage = StartMsg | PosMsg | CoinMsg | DamageMsg | WaitMsg | ResultMsg | DiagMsg;

export function encode(msg: NetMessage): string {
  return JSON.stringify(msg);
}

export function decode(raw: string): NetMessage | null {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(v)) return null;
  switch (v.t) {
    case 'start':
      return (v.mode === 'coop' || v.mode === 'compete') &&
        num(v.seed) &&
        num(v.difficulty) &&
        num(v.health) &&
        num(v.points) &&
        num(v.winCon) &&
        num(v.coinX) &&
        num(v.coinY)
        ? {
            t: 'start',
            mode: v.mode,
            seed: v.seed,
            difficulty: v.difficulty,
            health: v.health,
            points: v.points,
            winCon: v.winCon,
            coinX: v.coinX,
            coinY: v.coinY,
          }
        : null;
    case 'pos':
      return num(v.x) && num(v.y) && num(v.vx) && num(v.vy) && num(v.hp) && num(v.coins)
        ? { t: 'pos', x: v.x, y: v.y, vx: v.vx, vy: v.vy, hp: v.hp, coins: v.coins }
        : null;
    case 'coin':
      return num(v.x) && num(v.y) && num(v.points)
        ? { t: 'coin', x: v.x, y: v.y, points: v.points }
        : null;
    case 'damage':
      return num(v.health) ? { t: 'damage', health: v.health } : null;
    case 'wait':
      return { t: 'wait' };
    case 'result':
      return (v.winner === 'host' || v.winner === 'guest') && num(v.hostWins) && num(v.guestWins)
        ? { t: 'result', winner: v.winner, hostWins: v.hostWins, guestWins: v.guestWins }
        : null;
    case 'diag':
      return num(v.tick) &&
        num(v.spawns) &&
        num(v.sigN) &&
        num(v.sigDir) &&
        num(v.sigSprite) &&
        num(v.coinX) &&
        num(v.coinY) &&
        num(v.points) &&
        num(v.health)
        ? {
            t: 'diag',
            tick: v.tick,
            spawns: v.spawns,
            sigN: v.sigN,
            sigDir: v.sigDir,
            sigSprite: v.sigSprite,
            coinX: v.coinX,
            coinY: v.coinY,
            points: v.points,
            health: v.health,
          }
        : null;
    default:
      return null;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function num(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
