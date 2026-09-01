/**
 * Generates the extension icons (16/32/48/128) as real PNG files with no
 * external dependencies. Draws a white lightning bolt on a rounded indigo tile,
 * supersampled 4x for smooth edges. Run via `npm run gen:icons` (also invoked
 * by the build).
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const SIZES = [16, 32, 48, 128];
const SS = 4; // supersampling factor

/* ---- CRC32 + PNG chunk writer ---- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // rest 0 (compression, filter, interlace)
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/* ---- drawing ---- */
const BOLT = [
  [0.58, 0.05],
  [0.30, 0.53],
  [0.47, 0.53],
  [0.42, 0.95],
  [0.73, 0.44],
  [0.55, 0.44],
];
function pointInPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
function insideRoundRect(x, y, w, h, r) {
  const cx = Math.min(Math.max(x, r), w - r);
  const cy = Math.min(Math.max(y, r), h - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r || (x >= r && x <= w - r) || (y >= r && y <= h - r);
}
function lerp(a, b, t) { return a + (b - a) * t; }

function render(size) {
  const R = size * SS;
  const hi = [0x81, 0x8c, 0xf8]; // top color (indigo)
  const lo = [0x0d, 0x94, 0x88]; // bottom color (teal) — signals the combined CPU+GPU build
  const radius = R * 0.22;
  const big = Buffer.alloc(R * R * 4);
  for (let y = 0; y < R; y++) {
    for (let x = 0; x < R; x++) {
      const idx = (y * R + x) * 4;
      if (!insideRoundRect(x + 0.5, y + 0.5, R, R, radius)) continue;
      const t = y / R;
      let r = Math.round(lerp(hi[0], lo[0], t));
      let g = Math.round(lerp(hi[1], lo[1], t));
      let b = Math.round(lerp(hi[2], lo[2], t));
      if (pointInPoly((x + 0.5) / R, (y + 0.5) / R, BOLT)) {
        r = g = b = 255;
      }
      big[idx] = r; big[idx + 1] = g; big[idx + 2] = b; big[idx + 3] = 255;
    }
  }
  // Downscale with box filter (premultiplied alpha).
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let ar = 0, ag = 0, ab = 0, aa = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const bi = ((y * SS + sy) * R + (x * SS + sx)) * 4;
          const a = big[bi + 3] / 255;
          ar += big[bi] * a; ag += big[bi + 1] * a; ab += big[bi + 2] * a; aa += a;
        }
      }
      const n = SS * SS;
      const alpha = aa / n;
      const oi = (y * size + x) * 4;
      if (alpha > 0) {
        out[oi] = Math.round(ar / aa);
        out[oi + 1] = Math.round(ag / aa);
        out[oi + 2] = Math.round(ab / aa);
        out[oi + 3] = Math.round(alpha * 255);
      }
    }
  }
  return encodePng(size, size, out);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const s of SIZES) {
  writeFileSync(join(OUT_DIR, `icon${s}.png`), render(s));
  console.log(`icons: wrote icon${s}.png`);
}
