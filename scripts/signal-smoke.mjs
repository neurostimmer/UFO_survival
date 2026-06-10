// Integration smoke test for the SignalRoom Durable Object.
//
// Run `wrangler dev` first (npm run cf:dev), then `node scripts/signal-smoke.mjs`.
// It opens two WebSocket peers (host + guest) against /rtc/room/<code> and
// verifies the DO pairs them (peer-joined), relays signaling frames both ways,
// and reports peer-left on disconnect. This exercises the whole signaling path
// for real — everything up to, but not including, the browser-only WebRTC
// handshake. Uses Node's built-in WebSocket (Node 22+), so no extra deps.

const BASE = process.env.SIGNAL_BASE ?? 'ws://localhost:8787';
const ROOM = 'SMOKE';
const TIMEOUT_MS = 15000;

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const isType = (t) => (raw) => safeParse(raw)?.type === t;

function open(role) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${BASE}/rtc/room/${ROOM}?role=${role}`);
    const msgs = [];
    ws.addEventListener('message', (e) => {
      if (typeof e.data === 'string') msgs.push(e.data);
    });
    ws.addEventListener('open', () => resolve({ ws, msgs }));
    ws.addEventListener('error', () => reject(new Error(`${role}: websocket error`)));
    setTimeout(() => reject(new Error(`${role}: open timed out`)), TIMEOUT_MS);
  });
}

function waitFor(peer, pred, label) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      if (peer.msgs.some(pred)) return resolve();
      if (Date.now() - started > TIMEOUT_MS) return reject(new Error(`timeout: ${label}`));
      setTimeout(check, 50);
    };
    check();
  });
}

let failures = 0;
function assert(cond, msg) {
  if (cond) {
    console.log('  ok  —', msg);
  } else {
    failures++;
    console.error('  FAIL —', msg);
  }
}

const host = await open('host');
const guest = await open('guest');

// Both peers learn they're paired (the host uses this to start its WebRTC offer).
await waitFor(host, isType('peer-joined'), 'host peer-joined');
await waitFor(guest, isType('peer-joined'), 'guest peer-joined');
assert(true, 'both peers received peer-joined');

// Guest -> host relay, payload intact.
guest.ws.send(JSON.stringify({ type: 'offer', sdp: 'FAKE_SDP' }));
await waitFor(host, isType('offer'), 'host received relayed offer');
const offer = host.msgs.map(safeParse).find((m) => m?.type === 'offer');
assert(offer?.sdp === 'FAKE_SDP', 'offer payload relayed byte-for-byte');

// Host -> guest relay.
host.ws.send(JSON.stringify({ type: 'answer', sdp: 'FAKE_ANSWER' }));
await waitFor(guest, isType('answer'), 'guest received relayed answer');
const answer = guest.msgs.map(safeParse).find((m) => m?.type === 'answer');
assert(answer?.sdp === 'FAKE_ANSWER', 'answer payload relayed byte-for-byte');

// Disconnect notifies the surviving peer.
guest.ws.close();
await waitFor(host, isType('peer-left'), 'host notified of peer-left');
assert(true, 'peer-left delivered on guest disconnect');

host.ws.close();

if (failures > 0) {
  console.error(`\nsignal-smoke: ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('\nsignal-smoke: all checks passed');
process.exit(0);
