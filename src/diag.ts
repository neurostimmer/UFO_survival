// Debug-only on-screen diagnostics for online co-op, enabled with ?debug=1.
//
// The host renders a running log strip under the canvas, comparing its own sim
// state against the guest's (piped over the data channel as `diag` frames), so
// a seed/coin desync is visible on ONE screen instead of diffing two browser
// consoles. Off by default and entirely separate from the game canvas — when
// ?debug=1 is absent, nothing here ever runs.

let enabled: boolean | null = null;

// Read once: whether ?debug=1 is on the current URL. Only the host needs it —
// the guest emits its digest unconditionally (a few bytes every ~0.5 s).
export function debugEnabled(): boolean {
  if (enabled === null) {
    enabled = new URLSearchParams(location.search).get('debug') === '1';
  }
  return enabled;
}

let panel: HTMLElement | null = null;
const MAX_LINES = 200;

function ensurePanel(): HTMLElement {
  if (panel) return panel;
  const el = document.createElement('div');
  el.id = 'diag';
  // Fixed bottom strip so it sits clear of the centered canvas regardless of
  // the page's flex layout. CSP allows inline styles (style-src 'unsafe-inline').
  el.style.cssText = [
    'position:fixed',
    'left:0',
    'right:0',
    'bottom:0',
    'max-height:32vh',
    'overflow-y:auto',
    'margin:0',
    'padding:4px 8px',
    'background:rgba(0,0,0,0.85)',
    'font:11px/1.35 ui-monospace,Menlo,Consolas,monospace',
    'white-space:pre',
    'z-index:9999',
    'border-top:1px solid #333',
  ].join(';');
  document.body.appendChild(el);
  panel = el;
  return el;
}

// Append one line to the log. ok === false → red (mismatch), true → green
// (match), undefined → grey (informational). Oldest lines are trimmed and the
// strip auto-scrolls to the newest.
export function diagLine(text: string, ok?: boolean): void {
  const el = ensurePanel();
  const line = document.createElement('div');
  line.textContent = text;
  line.style.color = ok === false ? '#f77' : ok === true ? '#9f9' : '#bbb';
  el.appendChild(line);
  while (el.childElementCount > MAX_LINES) el.firstElementChild?.remove();
  el.scrollTop = el.scrollHeight;
}
