/// <reference types="@cloudflare/workers-types" />

// SignalRoom — one WebRTC signaling rendezvous, addressed by room code.
//
// It relays SDP offer/answer + ICE candidates between exactly two peers (a
// host and a guest) and tells each side when the other joins or leaves. It
// holds NO game state and needs NO storage: the WebSocket Hibernation API
// keeps the two sockets alive across DO hibernation, and each socket is tagged
// with its role so we can find "the other peer" after a wake-up without any
// in-memory bookkeeping (which would be lost on hibernation).
//
// The DO is a dumb pipe. It never parses SDP or ICE; it only mints the
// {type:'peer-joined'} / {type:'peer-left'} control frames the client uses to
// drive the handshake (host creates its offer when it sees peer-joined).

export interface Env {
  SIGNAL_ROOM: DurableObjectNamespace;
}

type Role = 'host' | 'guest';

const PEER_JOINED = JSON.stringify({ type: 'peer-joined' });
const PEER_LEFT = JSON.stringify({ type: 'peer-left' });

export class SignalRoom implements DurableObject {
  private readonly state: DurableObjectState;

  constructor(state: DurableObjectState, _env: Env) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const role = url.searchParams.get('role');
    if (role !== 'host' && role !== 'guest') {
      return new Response('role query param must be "host" or "guest"', { status: 400 });
    }
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected a websocket upgrade', { status: 426 });
    }

    // One live socket per role. A reconnecting peer (e.g. a refreshed tab)
    // evicts the stale socket holding its slot rather than being rejected.
    for (const stale of this.state.getWebSockets(role)) {
      stale.close(4001, 'replaced by a newer connection for this role');
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.state.acceptWebSocket(server, [role]);

    // If the other peer is already connected, pair them up immediately. Both
    // sides get peer-joined so either ordering of arrival works.
    const other: Role = role === 'host' ? 'guest' : 'host';
    const peers = this.state.getWebSockets(other);
    if (peers.length > 0) {
      server.send(PEER_JOINED);
      for (const p of peers) p.send(PEER_JOINED);
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  // Relay every signaling frame verbatim to the other peer.
  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    for (const peer of this.state.getWebSockets()) {
      if (peer !== ws) this.trySend(peer, message);
    }
  }

  webSocketClose(ws: WebSocket): void {
    this.notifyPeerLeft(ws);
  }

  webSocketError(ws: WebSocket): void {
    this.notifyPeerLeft(ws);
  }

  private notifyPeerLeft(ws: WebSocket): void {
    for (const peer of this.state.getWebSockets()) {
      if (peer !== ws) this.trySend(peer, PEER_LEFT);
    }
  }

  private trySend(peer: WebSocket, message: string | ArrayBuffer): void {
    try {
      peer.send(message);
    } catch {
      // The peer socket is already gone; its own close handler does cleanup.
    }
  }
}
