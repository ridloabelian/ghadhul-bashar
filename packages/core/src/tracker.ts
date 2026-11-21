import type { RegionBox } from './types.js';

/**
 * Computes a compact 16x16 grayscale luma vector from an RGBA buffer.
 * Used for sub-millisecond video scene-cut detection before frames reach the eye.
 */
export function computeLuma16x16(
  rgba: ArrayLike<number>,
  width: number,
  height: number
): Uint8Array {
  const out = new Uint8Array(256);
  if (width <= 0 || height <= 0 || rgba.length < width * height * 4) {
    return out;
  }
  const stepX = Math.max(1, Math.floor(width / 16));
  const stepY = Math.max(1, Math.floor(height / 16));

  for (let gy = 0; gy < 16; gy++) {
    const py = Math.min(height - 1, Math.floor(gy * (height / 16) + stepY * 0.5));
    for (let gx = 0; gx < 16; gx++) {
      const px = Math.min(width - 1, Math.floor(gx * (width / 16) + stepX * 0.5));
      const idx = (py * width + px) * 4;
      const r = rgba[idx] ?? 0;
      const g = rgba[idx + 1] ?? 0;
      const b = rgba[idx + 2] ?? 0;
      out[gy * 16 + gx] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }
  }
  return out;
}

/**
 * Returns true when an abrupt camera cut / scene change occurs between frames,
 * allowing the video shield to engage immediately before keyframe AI runs.
 */
export function detectSceneCut(
  prevLuma: Uint8Array | null,
  currLuma: Uint8Array,
  meanDeltaThreshold = 28
): boolean {
  if (!prevLuma || prevLuma.length !== currLuma.length || currLuma.length === 0) {
    return true;
  }
  let diffSum = 0;
  let strongCells = 0;
  for (let i = 0; i < currLuma.length; i++) {
    const d = Math.abs((currLuma[i] ?? 0) - (prevLuma[i] ?? 0));
    diffSum += d;
    if (d >= 42) strongCells++;
  }
  const meanDiff = diffSum / currLuma.length;
  return meanDiff >= meanDeltaThreshold || strongCells >= currLuma.length * 0.45;
}

interface TrackState {
  id: number;
  box: RegionBox;
  vx: number;
  vy: number;
  vw: number;
  vh: number;
  lastSeenMs: number;
  missedCount: number;
}

function boxIoU(a: RegionBox, b: RegionBox): number {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * Multi-object Kalman/linear-velocity tracker bridging 5-8 Hz AI keyframes
 * smoothly to 60 FPS overlay updates with anti-flicker grace frames.
 */
export class RegionTracker {
  private tracks: TrackState[] = [];
  private nextTrackId = 1;
  private lastUpdateMs = 0;
  private readonly maxMissedKeyframes: number;
  private readonly minMatchIoU: number;

  constructor(maxMissedKeyframes = 3, minMatchIoU = 0.22) {
    this.maxMissedKeyframes = maxMissedKeyframes;
    this.minMatchIoU = minMatchIoU;
  }

  reset(): void {
    this.tracks = [];
    this.lastUpdateMs = 0;
  }

  update(detections: RegionBox[], timestampMs: number): RegionBox[] {
    const dtSec =
      this.lastUpdateMs > 0 ? Math.max(0.016, (timestampMs - this.lastUpdateMs) / 1000) : 0;
    this.lastUpdateMs = timestampMs;

    const matchedTracks = new Set<number>();
    const updatedTracks: TrackState[] = [];

    for (const det of detections) {
      let bestTrack: TrackState | null = null;
      let bestScore = this.minMatchIoU;

      for (const tr of this.tracks) {
        if (matchedTracks.has(tr.id)) continue;
        if (tr.box.label !== det.label) continue;
        const score = boxIoU(tr.box, det);
        if (score >= bestScore) {
          bestScore = score;
          bestTrack = tr;
        }
      }

      if (bestTrack) {
        matchedTracks.add(bestTrack.id);
        const alpha = 0.6;
        const instVx = dtSec > 0 ? (det.x - bestTrack.box.x) / dtSec : 0;
        const instVy = dtSec > 0 ? (det.y - bestTrack.box.y) / dtSec : 0;
        const instVw = dtSec > 0 ? (det.w - bestTrack.box.w) / dtSec : 0;
        const instVh = dtSec > 0 ? (det.h - bestTrack.box.h) / dtSec : 0;
        updatedTracks.push({
          id: bestTrack.id,
          box: { ...det, trackId: bestTrack.id },
          vx: alpha * instVx + (1 - alpha) * bestTrack.vx,
          vy: alpha * instVy + (1 - alpha) * bestTrack.vy,
          vw: alpha * instVw + (1 - alpha) * bestTrack.vw,
          vh: alpha * instVh + (1 - alpha) * bestTrack.vh,
          lastSeenMs: timestampMs,
          missedCount: 0,
        });
      } else {
        const id = this.nextTrackId++;
        updatedTracks.push({
          id,
          box: { ...det, trackId: id },
          vx: 0,
          vy: 0,
          vw: 0,
          vh: 0,
          lastSeenMs: timestampMs,
          missedCount: 0,
        });
      }
    }

    // Keep unmatched tracks briefly to absorb single-keyframe misses without flicker.
    for (const tr of this.tracks) {
      if (matchedTracks.has(tr.id)) continue;
      const missedCount = tr.missedCount + 1;
      if (missedCount <= this.maxMissedKeyframes) {
        updatedTracks.push({
          ...tr,
          missedCount,
        });
      }
    }

    this.tracks = updatedTracks;
    return this.tracks.map((t) => t.box);
  }

  predict(nowMs: number): RegionBox[] {
    return this.tracks.map((tr) => {
      const dtSec = Math.min(0.25, Math.max(0, (nowMs - tr.lastSeenMs) / 1000));
      const x = clamp01(tr.box.x + tr.vx * dtSec);
      const y = clamp01(tr.box.y + tr.vy * dtSec);
      const w = clamp01(Math.max(0.01, tr.box.w + tr.vw * dtSec));
      const h = clamp01(Math.max(0.01, tr.box.h + tr.vh * dtSec));
      return {
        ...tr.box,
        x,
        y,
        w: Math.min(w, 1 - x),
        h: Math.min(h, 1 - y),
      };
    });
  }
}
