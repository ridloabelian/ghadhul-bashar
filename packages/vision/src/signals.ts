import type { RegionBox } from '@ghadhul-bashar/core';

export interface VisualSignalReport {
  ambientColor: [number, number, number];
  skinRatio: number;
  peakBlockSkinRatio: number;
  animeSkinRatio: number;
  colorStdDev: number;
  edgeRatio: number;
  nonUniformBlocks: number;
  isGrayscaleRichPhoto: boolean;
  mangaLineArtSignal: boolean;
  isTrivialGraphic: boolean;
}

const GRID_DIM = 64;
const BLOCK_SIZE = 8;
const BLOCKS_PER_ROW = GRID_DIM / BLOCK_SIZE; // 8x8 = 64 macro-blocks

function isPhotographicSkin(r: number, g: number, b: number, y: number, cb: number, cr: number): boolean {
  // Primary Fitzpatrick I-V YCbCr skin locus + RGB dominance guard
  if (y > 40 && cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173 && r > g && r > b) {
    return true;
  }
  // Darker/warm melanin Fitzpatrick V-VI extension
  if (y >= 25 && y <= 95 && cr >= 128 && cr <= 165 && cb >= 85 && cb <= 132 && r - b >= 12 && r >= g) {
    return true;
  }
  return false;
}

function isAnimeIllustrationSkin(r: number, g: number, b: number): boolean {
  return (
    r >= 195 &&
    g >= 145 &&
    g <= 235 &&
    b >= 125 &&
    b <= 220 &&
    r > g &&
    g >= b - 10 &&
    r - b >= 12 &&
    r - b <= 95
  );
}

/**
 * Single-pass sub-millisecond visual signal profiler over a 64x64 RGBA canvas sample.
 * Computes ambient fill color, skin tone distribution, anime flesh signals,
 * grayscale photography vs B&W manga line-art, and trivial graphic skipping.
 */
export function profileVisualSignals(rgba64x64: ArrayLike<number>): VisualSignalReport {
  const totalPixels = GRID_DIM * GRID_DIM;
  if (rgba64x64.length < totalPixels * 4) {
    return {
      ambientColor: [24, 32, 38],
      skinRatio: 0,
      peakBlockSkinRatio: 0,
      animeSkinRatio: 0,
      colorStdDev: 0,
      edgeRatio: 0,
      nonUniformBlocks: 0,
      isGrayscaleRichPhoto: false,
      mangaLineArtSignal: false,
      isTrivialGraphic: true,
    };
  }

  const lumaGrid = new Uint8Array(totalPixels);
  const blockSkin = new Uint16Array(BLOCKS_PER_ROW * BLOCKS_PER_ROW);
  const blockMinLuma = new Uint8Array(BLOCKS_PER_ROW * BLOCKS_PER_ROW).fill(255);
  const blockMaxLuma = new Uint8Array(BLOCKS_PER_ROW * BLOCKS_PER_ROW).fill(0);

  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let lumaSum = 0;
  let lumaSqSum = 0;
  let skinCount = 0;
  let animeCount = 0;
  let achromaticCount = 0;
  let midToneCount = 0;
  let bimodalInkWhiteCount = 0;

  for (let py = 0; py < GRID_DIM; py++) {
    const by = py >> 3;
    for (let px = 0; px < GRID_DIM; px++) {
      const pIdx = py * GRID_DIM + px;
      const base = pIdx * 4;
      const r = rgba64x64[base] ?? 0;
      const g = rgba64x64[base + 1] ?? 0;
      const b = rgba64x64[base + 2] ?? 0;

      rSum += r;
      gSum += g;
      bSum += b;

      const y = 0.299 * r + 0.587 * g + 0.114 * b;
      const yInt = y | 0;
      lumaGrid[pIdx] = yInt;
      lumaSum += y;
      lumaSqSum += y * y;

      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

      const bx = px >> 3;
      const bIdx = by * BLOCKS_PER_ROW + bx;

      if (isPhotographicSkin(r, g, b, y, cb, cr)) {
        skinCount++;
        blockSkin[bIdx]! += 1;
      } else if (isAnimeIllustrationSkin(r, g, b)) {
        animeCount++;
      }

      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      if (maxC - minC <= 18) {
        achromaticCount++;
        if (yInt < 55 || yInt > 205) {
          bimodalInkWhiteCount++;
        }
      }
      if (yInt >= 35 && yInt <= 220) {
        midToneCount++;
      }

      if (yInt < blockMinLuma[bIdx]!) blockMinLuma[bIdx] = yInt;
      if (yInt > blockMaxLuma[bIdx]!) blockMaxLuma[bIdx] = yInt;
    }
  }

  let edgeCount = 0;
  for (let py = 0; py < GRID_DIM; py++) {
    for (let px = 0; px < GRID_DIM; px++) {
      const idx = py * GRID_DIM + px;
      const cur = lumaGrid[idx]!;
      const dx = px > 0 ? Math.abs(cur - lumaGrid[idx - 1]!) : 0;
      const dy = py > 0 ? Math.abs(cur - lumaGrid[idx - GRID_DIM]!) : 0;
      if (dx >= 26 || dy >= 26) edgeCount++;
    }
  }

  let peakBlockSkinRatio = 0;
  let nonUniformBlocks = 0;
  const pixelsPerBlock = BLOCK_SIZE * BLOCK_SIZE;
  for (let b = 0; b < blockSkin.length; b++) {
    const ratio = blockSkin[b]! / pixelsPerBlock;
    if (ratio > peakBlockSkinRatio) peakBlockSkinRatio = ratio;
    if (blockMaxLuma[b]! - blockMinLuma[b]! >= 18) nonUniformBlocks++;
  }

  const meanLuma = lumaSum / totalPixels;
  const colorStdDev = Math.sqrt(Math.max(0, lumaSqSum / totalPixels - meanLuma * meanLuma));
  const skinRatio = skinCount / totalPixels;
  const animeSkinRatio = animeCount / totalPixels;
  const edgeRatio = edgeCount / totalPixels;
  const achromaticRatio = achromaticCount / totalPixels;
  const midToneRatio = midToneCount / totalPixels;
  const bimodalInkWhiteRatio = bimodalInkWhiteCount / totalPixels;

  const isGrayscaleRichPhoto =
    achromaticRatio >= 0.85 &&
    nonUniformBlocks >= 10 &&
    midToneRatio >= 0.15 &&
    midToneRatio <= 0.85;

  const mangaLineArtSignal =
    achromaticRatio >= 0.78 && bimodalInkWhiteRatio >= 0.55 && edgeRatio >= 0.1;

  const isTrivialGraphic =
    skinRatio < 0.01 &&
    peakBlockSkinRatio < 0.06 &&
    animeSkinRatio < 0.015 &&
    !isGrayscaleRichPhoto &&
    !mangaLineArtSignal &&
    (nonUniformBlocks <= 4 || (colorStdDev < 14 && edgeRatio < 0.02));

  return {
    ambientColor: [
      Math.round(rSum / totalPixels),
      Math.round(gSum / totalPixels),
      Math.round(bSum / totalPixels),
    ],
    skinRatio,
    peakBlockSkinRatio,
    animeSkinRatio,
    colorStdDev,
    edgeRatio,
    nonUniformBlocks,
    isGrayscaleRichPhoto,
    mangaLineArtSignal,
    isTrivialGraphic,
  };
}

/**
 * Measures skin-tone ratio outside detected face rectangles (expanded slightly for chin/neck)
 * so modestly dressed headshots are distinguished cleanly from exposed-body shots.
 */
export function computeOutsideFaceSkin(
  rgba64x64: ArrayLike<number>,
  faces: Array<Pick<RegionBox, 'x' | 'y' | 'w' | 'h'>>
): { outsideSkinRatio: number; outsidePeakBlockSkin: number } {
  const totalPixels = GRID_DIM * GRID_DIM;
  if (rgba64x64.length < totalPixels * 4) {
    return { outsideSkinRatio: 0, outsidePeakBlockSkin: 0 };
  }

  const expanded = faces.map((f) => {
    const cx = f.x + f.w * 0.5;
    const cy = f.y + f.h * 0.5;
    const ew = f.w * 1.3;
    const eh = f.h * 1.35;
    return {
      x0: cx - ew * 0.5,
      x1: cx + ew * 0.5,
      y0: cy - eh * 0.45,
      y1: cy + eh * 0.55,
    };
  });

  const blockSkin = new Uint16Array(BLOCKS_PER_ROW * BLOCKS_PER_ROW);
  const blockValid = new Uint16Array(BLOCKS_PER_ROW * BLOCKS_PER_ROW);
  let outsideTotal = 0;
  let outsideSkin = 0;

  for (let py = 0; py < GRID_DIM; py++) {
    const ny = (py + 0.5) / GRID_DIM;
    const by = py >> 3;
    for (let px = 0; px < GRID_DIM; px++) {
      const nx = (px + 0.5) / GRID_DIM;
      let insideFace = false;
      for (const box of expanded) {
        if (nx >= box.x0 && nx <= box.x1 && ny >= box.y0 && ny <= box.y1) {
          insideFace = true;
          break;
        }
      }
      if (insideFace) continue;

      outsideTotal++;
      const bIdx = by * BLOCKS_PER_ROW + (px >> 3);
      blockValid[bIdx]! += 1;

      const base = (py * GRID_DIM + px) * 4;
      const r = rgba64x64[base] ?? 0;
      const g = rgba64x64[base + 1] ?? 0;
      const b = rgba64x64[base + 2] ?? 0;
      const y = 0.299 * r + 0.587 * g + 0.114 * b;
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      if (isPhotographicSkin(r, g, b, y, cb, cr)) {
        outsideSkin++;
        blockSkin[bIdx]! += 1;
      }
    }
  }

  let outsidePeakBlockSkin = 0;
  for (let b = 0; b < blockSkin.length; b++) {
    const valid = blockValid[b]!;
    if (valid >= 16) {
      const ratio = blockSkin[b]! / valid;
      if (ratio > outsidePeakBlockSkin) outsidePeakBlockSkin = ratio;
    }
  }

  return {
    outsideSkinRatio: outsideTotal > 0 ? outsideSkin / outsideTotal : 0,
    outsidePeakBlockSkin,
  };
}
