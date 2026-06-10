/// <reference types="@cloudflare/workers-types" />

// Worker entry. Per wrangler.jsonc `run_worker_first: ["/rtc/*"]`, this script
// only runs for /rtc/* requests; every other path (the game itself) is served
// straight from the static-asset bundle in ./dist and never reaches here.
//
// The single route is the signaling WebSocket: GET /rtc/room/<code>?role=...
// which is forwarded to the SignalRoom Durable Object named by <code>. All
// peers using the same code land in the same DO instance — that's the
// rendezvous.

import { SignalRoom } from './signal-room';

export { SignalRoom };

export interface Env {
  SIGNAL_ROOM: DurableObjectNamespace;
}

const ROOM_RE = /^\/rtc\/room\/([A-Za-z0-9_-]{1,32})$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(ROOM_RE);
    const code = match?.[1];
    if (code) {
      // Canonicalize the code so "abcd" and "ABCD" rendezvous in one room.
      const id = env.SIGNAL_ROOM.idFromName(code.toUpperCase());
      const room = env.SIGNAL_ROOM.get(id);
      return room.fetch(request);
    }
    return new Response('not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
