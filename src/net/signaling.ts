// Signaling channel: a same-origin WebSocket to the Cloudflare Worker, which
// forwards to the SignalRoom Durable Object named by the room code. Carries the
// SDP offer/answer + trickle-ICE handshake, plus the peer-joined/peer-left
// control frames the DO mints. Once the WebRTC DataChannel opens, gameplay
// traffic is pure peer-to-peer and this socket goes idle (kept open only so a
// dropped peer can be detected / a future renegotiation could flow).

export type SignalMessage =
  | { type: 'peer-joined' }
  | { type: 'peer-left' }
  | { type: 'offer'; sdp: string }
  | { type: 'answer'; sdp: string }
  | { type: 'ice'; candidate: RTCIceCandidateInit };

export interface SignalHandlers {
  onMessage(msg: SignalMessage): void;
  onClose(): void;
  onError(): void;
}

export interface SignalChannel {
  send(msg: SignalMessage): void;
  close(): void;
}

export function connectSignaling(
  code: string,
  role: 'host' | 'guest',
  handlers: SignalHandlers,
): SignalChannel {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${proto}//${location.host}/rtc/room/${encodeURIComponent(code)}?role=${role}`;
  const ws = new WebSocket(url);

  ws.onmessage = (ev: MessageEvent): void => {
    const msg = parseSignal(ev.data);
    if (msg) handlers.onMessage(msg);
  };
  ws.onclose = (): void => handlers.onClose();
  ws.onerror = (): void => handlers.onError();

  const sendRaw = (text: string): void => {
    if (ws.readyState === WebSocket.OPEN) ws.send(text);
    else ws.addEventListener('open', () => ws.send(text), { once: true });
  };

  return {
    send(msg: SignalMessage): void {
      sendRaw(JSON.stringify(msg));
    },
    close(): void {
      ws.close();
    },
  };
}

function parseSignal(data: unknown): SignalMessage | null {
  if (typeof data !== 'string') return null;
  let v: unknown;
  try {
    v = JSON.parse(data);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null) return null;
  const obj = v as Record<string, unknown>;
  switch (obj.type) {
    case 'peer-joined':
      return { type: 'peer-joined' };
    case 'peer-left':
      return { type: 'peer-left' };
    case 'offer':
      return typeof obj.sdp === 'string' ? { type: 'offer', sdp: obj.sdp } : null;
    case 'answer':
      return typeof obj.sdp === 'string' ? { type: 'answer', sdp: obj.sdp } : null;
    case 'ice':
      return typeof obj.candidate === 'object' && obj.candidate !== null
        ? { type: 'ice', candidate: obj.candidate as RTCIceCandidateInit }
        : null;
    default:
      return null;
  }
}
