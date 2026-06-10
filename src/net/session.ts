// WebRTC session orchestration. Symmetric: both roles expose the same
// send()/onMessage surface — the only asymmetry is that the host creates the
// offer and the guest answers. Trickle-ICE flows over the signaling WebSocket
// until the DataChannel opens, after which all game traffic is peer-to-peer.
//
// Deliberately thin: parsing/validation live in protocol.ts and signaling.ts;
// this is just the state-machine wiring (and the one piece that can't be tested
// headlessly, since there's no RTCPeerConnection outside a browser).

import { decode, encode, type NetMessage } from './protocol';
import { connectSignaling, type SignalChannel, type SignalMessage } from './signaling';

// Public STUN only — per the project assumption that ICE is viable. No TURN, so
// a symmetric-NAT-to-symmetric-NAT pair won't connect; add a TURN entry here if
// that ever needs covering (TURN relays aren't free).
const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
const CHANNEL_LABEL = 'game';
// Unreliable + unordered: gameplay is latest-wins, so never retransmit a stale
// position or event — just wait for the next one.
const CHANNEL_INIT: RTCDataChannelInit = { ordered: false, maxRetransmits: 0 };

export interface Session {
  send(msg: NetMessage): void;
  close(): void;
}

export interface SessionHandlers {
  onMessage(msg: NetMessage): void;
  onConnected(): void;
  onDisconnected(): void;
}

export function hostSession(code: string, h: SessionHandlers): Session {
  return createSession(code, 'host', h);
}

export function joinSession(code: string, h: SessionHandlers): Session {
  return createSession(code, 'guest', h);
}

function createSession(code: string, role: 'host' | 'guest', h: SessionHandlers): Session {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const ice = { remoteSet: false, pending: [] as RTCIceCandidateInit[] };
  let channel: RTCDataChannel | null = null;
  let closed = false;

  const disconnect = (): void => {
    if (!closed) {
      closed = true;
      h.onDisconnected();
    }
  };

  const wire = (ch: RTCDataChannel): void => {
    channel = ch;
    ch.onopen = (): void => h.onConnected();
    ch.onclose = (): void => disconnect();
    ch.onmessage = (ev: MessageEvent): void => {
      if (typeof ev.data !== 'string') return;
      const msg = decode(ev.data);
      if (msg) h.onMessage(msg);
    };
  };

  // The host opens the channel (and so the offer carries it); the guest receives
  // it via ondatachannel.
  if (role === 'host') {
    wire(pc.createDataChannel(CHANNEL_LABEL, CHANNEL_INIT));
  } else {
    pc.ondatachannel = (ev): void => wire(ev.channel);
  }

  // signal is created before the handlers below reference it; onSignal is a
  // hoisted function declaration so onMessage can name it before its body.
  const signal: SignalChannel = connectSignaling(code, role, {
    onMessage: (m) => void onSignal(m),
    onClose: () => {},
    onError: () => {},
  });

  pc.onicecandidate = (ev): void => {
    if (ev.candidate) signal.send({ type: 'ice', candidate: ev.candidate.toJSON() });
  };
  pc.onconnectionstatechange = (): void => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') disconnect();
  };

  async function onSignal(m: SignalMessage): Promise<void> {
    if (role === 'host' && m.type === 'peer-joined') {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      signal.send({ type: 'offer', sdp: offer.sdp ?? '' });
    } else if (role === 'guest' && m.type === 'offer') {
      await pc.setRemoteDescription({ type: 'offer', sdp: m.sdp });
      await flushIce();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      signal.send({ type: 'answer', sdp: answer.sdp ?? '' });
    } else if (role === 'host' && m.type === 'answer') {
      await pc.setRemoteDescription({ type: 'answer', sdp: m.sdp });
      await flushIce();
    } else if (m.type === 'ice') {
      if (ice.remoteSet) await pc.addIceCandidate(m.candidate);
      else ice.pending.push(m.candidate);
    }
  }

  async function flushIce(): Promise<void> {
    ice.remoteSet = true;
    for (const c of ice.pending) await pc.addIceCandidate(c);
    ice.pending.length = 0;
  }

  return {
    send(msg: NetMessage): void {
      if (channel?.readyState === 'open') channel.send(encode(msg));
    },
    close(): void {
      closed = true;
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
    },
  };
}
