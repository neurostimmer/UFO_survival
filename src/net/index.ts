// Public barrel for the online co-op layer. game.ts imports only from here.

export type {
  BlockSnap,
  NetMessage,
  Phase,
  PlayerInput,
  Snapshot,
  SpawnSnap,
} from './protocol';
export { decode, encodeInput, encodeSnapshot } from './protocol';
export {
  type GuestHandlers,
  type GuestSession,
  type HostHandlers,
  type HostSession,
  hostSession,
  joinSession,
} from './session';

// Room-code alphabet: omits I/O/0/1/L so a shared code can't be misread.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// A room code is the access token for a session: anyone with the link can join
// (the DO caps a room at two peers, first-come). Math.random is fine here — the
// code gates nothing more sensitive than "who shares this co-op game".
export function makeRoomCode(len = 5): string {
  let out = '';
  for (let i = 0; i < len; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)] ?? 'A';
  }
  return out;
}

// Reads ?join=CODE from the current URL — set when a host shares their link.
export function roomFromUrl(): string | null {
  const code = new URLSearchParams(location.search).get('join');
  return code ? code.toUpperCase() : null;
}

// Builds the shareable link a host hands to a guest.
export function shareLink(code: string): string {
  const u = new URL(location.href);
  u.search = `?join=${code}`;
  u.hash = '';
  return u.toString();
}
