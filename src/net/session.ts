// WebRTC session orchestration. The host opens the DataChannel and drives the
// offer; the guest answers. Trickle-ICE candidates flow both ways over the
// signaling WebSocket until the channel opens, after which input/snapshot
// traffic is peer-to-peer.
//
// This module is the one piece that can't be unit-tested headlessly (no
// RTCPeerConnection outside a browser), so it stays deliberately thin: parsing
// and validation live in protocol.ts / signaling.ts, and this file is just the
// state-machine wiring.

import { decode, encodeInput, encodeSnapshot, type PlayerInput, type Snapshot } from './protocol';
import { connectSignaling, type SignalChannel, type SignalMessage } from './signaling';

// Public STUN only — per the project assumption that ICE is viable. No TURN, so
// a symmetric-NAT-to-symmetric-NAT pair won't connect; add a TURN entry here if
// that ever needs covering (TURN relays aren't free).
const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
const CHANNEL_LABEL = 'game';
// Unreliable + unordered: gameplay is latest-wins, so never retransmit a stale
// input or snapshot — just wait for the next one.
const CHANNEL_INIT: RTCDataChannelInit = { ordered: false, maxRetransmits: 0 };

export interface HostSession {
  sendSnapshot(s: Snapshot): void;
  close(): void;
}

export interface GuestSession {
  sendInput(i: PlayerInput): void;
  close(): void;
}

export interface HostHandlers {
  onPeerInput(i: PlayerInput): void;
  onConnected(): void;
  onDisconnected(): void;
}

export interface GuestHandlers {
  onSnapshot(s: Snapshot): void;
  onConnected(): void;
  onDisconnected(): void;
}

// Buffers ICE candidates that arrive before the remote description is set, then
// flushes them once it is. addIceCandidate before setRemoteDescription throws.
interface IceQueue {
  remoteSet: boolean;
  pending: RTCIceCandidateInit[];
}

async function acceptIce(
  pc: RTCPeerConnection,
  q: IceQueue,
  c: RTCIceCandidateInit,
): Promise<void> {
  if (q.remoteSet) await pc.addIceCandidate(c);
  else q.pending.push(c);
}

async function flushIce(pc: RTCPeerConnection, q: IceQueue): Promise<void> {
  q.remoteSet = true;
  for (const c of q.pending) await pc.addIceCandidate(c);
  q.pending.length = 0;
}

function wireChannel(
  channel: RTCDataChannel,
  onData: (raw: string) => void,
  onOpen: () => void,
  onClose: () => void,
): void {
  channel.onopen = (): void => onOpen();
  channel.onclose = (): void => onClose();
  channel.onmessage = (ev: MessageEvent): void => {
    if (typeof ev.data === 'string') onData(ev.data);
  };
}

function safeClose(
  channel: RTCDataChannel | null,
  pc: RTCPeerConnection,
  signal: SignalChannel,
): void {
  try {
    channel?.close();
  } catch {
    /* already closing */
  }
  try {
    pc.close();
  } catch {
    /* already closing */
  }
  signal.close();
}

export function hostSession(code: string, h: HostHandlers): HostSession {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const channel = pc.createDataChannel(CHANNEL_LABEL, CHANNEL_INIT);
  const ice: IceQueue = { remoteSet: false, pending: [] };
  let closed = false;

  const disconnect = (): void => {
    if (!closed) {
      closed = true;
      h.onDisconnected();
    }
  };

  // signal is created first so the handlers below can reference it; onSignal is
  // a hoisted function declaration so onMessage can name it before its body.
  const signal: SignalChannel = connectSignaling(code, 'host', {
    onMessage: (m) => void onSignal(m),
    onClose: () => {},
    onError: () => {},
  });

  wireChannel(
    channel,
    (raw) => {
      const msg = decode(raw);
      if (msg?.t === 'input') h.onPeerInput(msg.i);
    },
    h.onConnected,
    disconnect,
  );

  pc.onicecandidate = (ev): void => {
    if (ev.candidate) signal.send({ type: 'ice', candidate: ev.candidate.toJSON() });
  };
  pc.onconnectionstatechange = (): void => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') disconnect();
  };

  async function onSignal(m: SignalMessage): Promise<void> {
    if (m.type === 'peer-joined') {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      signal.send({ type: 'offer', sdp: offer.sdp ?? '' });
    } else if (m.type === 'answer') {
      await pc.setRemoteDescription({ type: 'answer', sdp: m.sdp });
      await flushIce(pc, ice);
    } else if (m.type === 'ice') {
      await acceptIce(pc, ice, m.candidate);
    }
  }

  return {
    sendSnapshot(s: Snapshot): void {
      if (channel.readyState === 'open') channel.send(encodeSnapshot(s));
    },
    close(): void {
      closed = true;
      safeClose(channel, pc, signal);
    },
  };
}

export function joinSession(code: string, h: GuestHandlers): GuestSession {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const ice: IceQueue = { remoteSet: false, pending: [] };
  let channel: RTCDataChannel | null = null;
  let closed = false;

  const disconnect = (): void => {
    if (!closed) {
      closed = true;
      h.onDisconnected();
    }
  };

  const signal: SignalChannel = connectSignaling(code, 'guest', {
    onMessage: (m) => void onSignal(m),
    onClose: () => {},
    onError: () => {},
  });

  pc.ondatachannel = (ev): void => {
    channel = ev.channel;
    wireChannel(
      channel,
      (raw) => {
        const msg = decode(raw);
        if (msg?.t === 'snap') h.onSnapshot(msg.s);
      },
      h.onConnected,
      disconnect,
    );
  };
  pc.onicecandidate = (ev): void => {
    if (ev.candidate) signal.send({ type: 'ice', candidate: ev.candidate.toJSON() });
  };
  pc.onconnectionstatechange = (): void => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') disconnect();
  };

  async function onSignal(m: SignalMessage): Promise<void> {
    if (m.type === 'offer') {
      await pc.setRemoteDescription({ type: 'offer', sdp: m.sdp });
      await flushIce(pc, ice);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      signal.send({ type: 'answer', sdp: answer.sdp ?? '' });
    } else if (m.type === 'ice') {
      await acceptIce(pc, ice, m.candidate);
    }
  }

  return {
    sendInput(i: PlayerInput): void {
      if (channel?.readyState === 'open') channel.send(encodeInput(i));
    },
    close(): void {
      closed = true;
      safeClose(channel, pc, signal);
    },
  };
}
