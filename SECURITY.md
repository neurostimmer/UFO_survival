# Security

This is unpublished hobby code. There is no formal security disclosure process.
If you find a real issue, open a GitHub issue on the repository.

## Threat model

- Single-page browser app, served as static files over HTTP from any host.
- No remote API, no authentication, no third-party network calls.
- Only persisted user data is a local high score in same-origin `localStorage` (when implemented).
- The relevant adversary class is a hostile script that arrives via supply-chain
  compromise of a build dependency. Mitigations: zero runtime dependencies,
  committed `package-lock.json`, any future CI uses `npm ci` (never `npm install`).

## Hardening notes

- Content Security Policy is set as a meta tag in `index.html`:
  `default-src 'self'`, no `eval`, no inline `<script>`, no third-party origins.
- `frame-ancestors 'none'` cannot be set via meta-tag CSP and **must** be
  configured as an HTTP response header at the deploy host. Without it,
  a hostile site could iframe this app for clickjacking.
- All assets are same-origin. No third-party CDNs, analytics, or telemetry.
- No use of Web Crypto SubtleCrypto, Service Workers, or other Secure Context-only
  APIs — the app is deliberately compatible with plain HTTP.
- Inline `<style>` is permitted by the CSP (`style-src 'self' 'unsafe-inline'`)
  for the small layout CSS in `index.html` and for Vite's dev-mode style injection.
  This is an acknowledged tradeoff appropriate to the threat model above.
