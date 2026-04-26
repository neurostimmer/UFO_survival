// Web Audio shim. Three responsibilities:
// 1. Map code.org's sound:// URLs to local /assets paths (best-effort; if the
//    asset isn't bundled yet, the call no-ops silently).
// 2. Defer AudioContext construction until the first user gesture (Chromium's
//    autoplay policy blocks it before then, regardless of HTTP/HTTPS).
// 3. Queue any playSound() calls made before unlock so music starts the moment
//    the user first interacts.

// Code.org's `sound://` scheme isn't a real URL — it's an internal asset
// reference that fails to resolve outside Game Lab. We map the original game's
// one music call to a CC0 substitute bundled at /public/assets/music_loop.mp3.
// See public/assets/music_loop.LICENSE.txt for attribution.
const URL_MAP = new Map<string, string>([
  [
    'sound://category_music/clear_evidence_loop1.mp3',
    `${import.meta.env.BASE_URL}assets/music_loop.mp3`,
  ],
]);

let ctx: AudioContext | null = null;
const bufferCache = new Map<string, AudioBuffer>();
const pending: Array<() => void> = [];

function ensureContext(): AudioContext | null {
  if (ctx) return ctx;
  try {
    ctx = new AudioContext();
    return ctx;
  } catch {
    return null;
  }
}

export function unlockAudio(): void {
  const c = ensureContext();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  while (pending.length > 0) {
    const fn = pending.shift();
    if (fn) fn();
  }
}

async function playInner(url: string, loop: boolean): Promise<void> {
  const c = ctx;
  if (!c) return;
  let buf = bufferCache.get(url);
  if (!buf) {
    try {
      const r = await fetch(url);
      if (!r.ok) return;
      const ab = await r.arrayBuffer();
      buf = await c.decodeAudioData(ab);
      bufferCache.set(url, buf);
    } catch {
      // Asset not present (e.g., music_loop.ogg not yet sourced) — silent.
      return;
    }
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = loop;
  src.connect(c.destination);
  src.start(0);
}

export function playSound(url: string, loop = false): void {
  const resolved = URL_MAP.get(url) ?? url;
  const c = ensureContext();
  if (!c || c.state === 'suspended') {
    pending.push(() => {
      void playInner(resolved, loop);
    });
    return;
  }
  void playInner(resolved, loop);
}
