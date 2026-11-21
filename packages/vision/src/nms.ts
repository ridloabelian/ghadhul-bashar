import type { BodyPartClass, RegionBox } from '@ghadhul-bashar/core';

export const NUDENET_LABELS: readonly BodyPartClass[] = [
  'FEMALE_GENITALIA_COVERED',
  'FACE_FEMALE',
  'BUTTOCKS_EXPOSED',
  'FEMALE_BREAST_EXPOSED',
  'FEMALE_GENITALIA_EXPOSED',
  'MALE_BREAST_EXPOSED',
  'ANUS_EXPOSED',
  'FEET_EXPOSED',
  'BELLY_COVERED',
  'FEET_COVERED',
  'ARMPITS_COVERED',
  'ARMPITS_EXPOSED',
  'FACE_MALE',
  'BELLY_EXPOSED',
  'MALE_GENITALIA_EXPOSED',
  'ANUS_COVERED',
  'FEMALE_BREAST_COVERED',
  'BUTTOCKS_COVERED',
] as const;

export function boxIoU(a: Pick<RegionBox, 'x' | 'y' | 'w' | 'h'>, b: Pick<RegionBox, 'x' | 'y' | 'w' | 'h'>): number {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function classAwareNms(
  boxes: RegionBox[],
  iouThreshold = 0.45,
  maxOutput = 64
): RegionBox[] {
  const sorted = [...boxes].sort((a, b) => b.confidence - a.confidence);
  const kept: RegionBox[] = [];

  for (const candidate of sorted) {
    let suppressed = false;
    for (const existing of kept) {
      const sameClass = existing.label === candidate.label;
      const bothFaces =
        (existing.label === 'FACE_FEMALE' || existing.label === 'FACE_MALE') &&
        (candidate.label === 'FACE_FEMALE' || candidate.label === 'FACE_MALE');
      if ((sameClass || bothFaces) && boxIoU(existing, candidate) > iouThreshold) {
        suppressed = true;
        break;
      }
    }
    if (!suppressed) {
      kept.push(candidate);
      if (kept.length >= maxOutput) break;
    }
  }
  return kept;
}

export interface RawFaceCandidate {
  x: number;
  y: number;
  w: number;
  h: number;
  score: number;
}

/**
 * Merges YuNet face boxes with existing NudeNet face detections so small,
 * tilted, or crowded faces (>2 people) are never missed.
 */
export function mergeFaceCandidates(
  existingBoxes: RegionBox[],
  yunetFaces: RawFaceCandidate[],
  maxFaces = 16
): { merged: RegionBox[]; faceIndices: number[] } {
  const merged = [...existingBoxes];

  for (const yf of yunetFaces.slice(0, maxFaces)) {
    const matchesExistingFace = merged.some(
      (b) =>
        (b.label === 'FACE_FEMALE' || b.label === 'FACE_MALE') &&
        boxIoU(b, yf) >= 0.30
    );
    if (!matchesExistingFace) {
      merged.push({
        x: clamp01(yf.x),
        y: clamp01(yf.y),
        w: clamp01(yf.w),
        h: clamp01(yf.h),
        label: 'FACE_FEMALE', // Neutral placeholder; refined immediately by AGR0013 gender+age
        confidence: yf.score,
      });
    }
  }

  const faceIndices: number[] = [];
  for (let i = 0; i < merged.length; i++) {
    const lbl = merged[i]?.label;
    if (lbl === 'FACE_FEMALE' || lbl === 'FACE_MALE') {
      faceIndices.push(i);
    }
  }
  return { merged, faceIndices: faceIndices.slice(0, maxFaces) };
}
