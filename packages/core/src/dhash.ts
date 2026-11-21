/**
 * Fast 64-bit Perceptual Difference Hash (dHash) over a 9x8 RGBA sample.
 * Images served from rotating CDN URLs or resized thumbnails share identical
 * or Hamming-close hashes (< 0.08 ms computation).
 */

export function computeDHash64(rgba9x8: ArrayLike<number>): string {
  const width = 9;
  const height = 8;
  if (rgba9x8.length < width * height * 4) {
    throw new Error(`Expected at least ${width * height * 4} RGBA bytes, got ${rgba9x8.length}`);
  }

  const luma = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const base = i * 4;
    const r = rgba9x8[base] ?? 0;
    const g = rgba9x8[base + 1] ?? 0;
    const b = rgba9x8[base + 2] ?? 0;
    luma[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  let hi = 0;
  let lo = 0;
  let bitIdx = 0;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width - 1; x++) {
      const bit = (luma[rowOffset + x]! > luma[rowOffset + x + 1]!) ? 1 : 0;
      if (bitIdx < 32) {
        hi = (hi << 1) | bit;
      } else {
        lo = (lo << 1) | bit;
      }
      bitIdx++;
    }
  }

  const hiHex = (hi >>> 0).toString(16).padStart(8, '0');
  const loHex = (lo >>> 0).toString(16).padStart(8, '0');
  return `${hiHex}${loHex}`;
}

export function hammingDistanceHex(a: string, b: string): number {
  if (a.length !== 16 || b.length !== 16) return 64;
  const hiA = parseInt(a.slice(0, 8), 16) >>> 0;
  const loA = parseInt(a.slice(8, 16), 16) >>> 0;
  const hiB = parseInt(b.slice(0, 8), 16) >>> 0;
  const loB = parseInt(b.slice(8, 16), 16) >>> 0;
  return popcount32(hiA ^ hiB) + popcount32(loA ^ loB);
}

function popcount32(n: number): number {
  let x = n >>> 0;
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

export class DHashLRUCache<T> {
  private readonly maxEntries: number;
  private readonly entries = new Map<string, T>();

  constructor(maxEntries = 2000) {
    this.maxEntries = maxEntries;
  }

  getExact(hash: string): T | undefined {
    const val = this.entries.get(hash);
    if (val !== undefined) {
      this.entries.delete(hash);
      this.entries.set(hash, val);
    }
    return val;
  }

  findSimilar(hash: string, maxDistance = 2): T | undefined {
    const exact = this.getExact(hash);
    if (exact !== undefined) return exact;
    if (maxDistance <= 0) return undefined;

    for (const [key, value] of this.entries) {
      if (hammingDistanceHex(hash, key) <= maxDistance) {
        return value;
      }
    }
    return undefined;
  }

  set(hash: string, value: T): void {
    if (this.entries.has(hash)) {
      this.entries.delete(hash);
    } else if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(hash, value);
  }

  get size(): number {
    return this.entries.size;
  }
}
