/**
 * Generates crisp emerald shield PNG icons (16, 32, 48, 128) cleanly with built-in Node zlib.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ICON_DIR = path.join(ROOT, 'apps', 'extension', 'public', 'icons');

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function renderShieldPng(size) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;

  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4);
    raw[rowStart] = 0; // filter none
    for (let x = 0; x < size; x++) {
      const nx = (x - cx) / (size * 0.44);
      const ny = (y - cy) / (size * 0.44);

      // Shield silhouette SDF approximation
      const shieldWidth = ny < 0.05 ? 0.92 : Math.max(0.05, 0.92 * (1 - Math.pow((ny - 0.05) / 0.98, 1.35)));
      const inShield = ny >= -0.95 && ny <= 1.0 && Math.abs(nx) <= shieldWidth;

      let r = 0, g = 0, b = 0, a = 0;
      if (inShield) {
        const edgeDist = Math.min(shieldWidth - Math.abs(nx), ny + 0.95, 1.0 - ny);
        const border = edgeDist < 0.14;
        // Crescent + calm pupil symbol inside shield
        const dMain = Math.hypot(nx, ny - 0.02);
        const dCut = Math.hypot(nx - 0.16, ny + 0.04);
        const inCrescent = dMain < 0.44 && dCut > 0.36;
        const inDot = Math.hypot(nx - 0.16, ny + 0.04) < 0.11;

        if (inCrescent || inDot) {
          r = 248; g = 250; b = 252; a = 255;
        } else if (border) {
          r = 52; g = 211; b = 153; a = 255; // emerald-400 border
        } else {
          // Deep emerald gradient
          const t = (ny + 1) * 0.5;
          r = Math.round(6 + t * 8);
          g = Math.round(95 - t * 30);
          b = Math.round(70 - t * 20);
          a = 255;
        }
      }

      const px = rowStart + 1 + x * 4;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
      raw[px + 3] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

fs.mkdirSync(ICON_DIR, { recursive: true });
for (const sz of [16, 32, 48, 128]) {
  fs.writeFileSync(path.join(ICON_DIR, `icon-${sz}.png`), renderShieldPng(sz));
}
console.log('Generated shield PNG icons (16, 32, 48, 128) in', ICON_DIR);
