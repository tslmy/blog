// Strip metadata (EXIF/GPS, XMP, ICC, comments) from images in place.
// Usage: node scripts/sanitize-images.mjs [dir]   (default: public/vault-assets)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sanitizeImage } from './lib/sanitize-image.mjs';

const dir = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, '../public/vault-assets'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sanitize-'));
let n = 0;
for (const f of fs.readdirSync(dir)) {
  const p = path.join(dir, f);
  if (!fs.statSync(p).isFile()) continue;
  const t = path.join(tmp, `x${path.extname(f)}`);
  sanitizeImage(p, t);
  fs.copyFileSync(t, p);
  n++;
}
console.log(`Sanitized ${n} image(s) in ${dir}`);
