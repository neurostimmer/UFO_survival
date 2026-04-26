// Re-copies every PNG in /assets to /public/assets so Vite serves the latest
// art. Run after dropping a new sprite into /assets. Idempotent.
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', 'assets');
const dst = join(here, '..', 'public', 'assets');

mkdirSync(dst, { recursive: true });
const pngs = readdirSync(src).filter((f) => f.endsWith('.png'));
for (const f of pngs) copyFileSync(join(src, f), join(dst, f));
console.log(`synced ${pngs.length} png(s) -> public/assets/`);
