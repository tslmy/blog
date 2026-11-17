import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Re-encode images without any metadata (EXIF/GPS, XMP, ICC, comments, text chunks).
// Refuses to publish an image it cannot sanitize.
const SANITIZABLE = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.tif', '.tiff', '.heic', '.avif']);
// GIFs: drop comment / plain-text / non-loop application blocks losslessly (re-encoding would bloat them).
const stripGif = (buf) => {
  const out = [buf.subarray(0, 6)];
  let i = 6;
  const flags = buf[i + 4];
  let hdr = 7 + (flags & 0x80 ? 3 * 2 ** ((flags & 7) + 1) : 0);
  out.push(buf.subarray(i, i + hdr));
  i += hdr;
  const skipSub = (j) => { while (buf[j] !== 0) j += buf[j] + 1; return j + 1; };
  while (i < buf.length) {
    const b = buf[i];
    if (b === 0x3b) { out.push(buf.subarray(i, i + 1)); break; }
    if (b === 0x21) {
      const label = buf[i + 1];
      const end = skipSub(i + 2);
      const id = label === 0xff ? buf.subarray(i + 3, i + 14).toString('latin1') : '';
      const keep = label === 0xf9 || (label === 0xff && /^(NETSCAPE2\.0|ANIMEXTS1\.0)/.test(id));
      if (keep) out.push(buf.subarray(i, end));
      i = end;
    } else if (b === 0x2c) {
      const f = buf[i + 9];
      let j = i + 10 + (f & 0x80 ? 3 * 2 ** ((f & 7) + 1) : 0) + 1; // LCT + LZW min code size
      j = skipSub(j);
      out.push(buf.subarray(i, j));
      i = j;
    } else throw new Error('malformed GIF');
  }
  return Buffer.concat(out);
};

export const sanitizeImage = (src, dest) => {
  const ext = path.extname(src).toLowerCase();
  if (!SANITIZABLE.has(ext)) throw new Error(`unsupported image type: ${src}`);
  if (ext === '.gif') {
    fs.writeFileSync(dest, stripGif(fs.readFileSync(src)));
    return;
  }
  try {
    execFileSync('magick', [src, '-auto-orient', '-strip', dest], { stdio: 'pipe' });
  } catch (e) {
    throw new Error(`could not strip metadata from ${src} (is ImageMagick's \`magick\` installed?)`);
  }
};
