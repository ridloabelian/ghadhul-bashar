import { describe, expect, it } from 'vitest';
import { computeMediaContentRect, projectRegionToElement } from '../../packages/core/src/index.js';
import { classAwareNms, mergeFaceCandidates } from '../../packages/vision/src/index.js';

describe('Object-Fit Coordinate Projection Math', () => {
  it('accurately projects normalized boxes for object-fit: cover and object-fit: contain', () => {
    // 400x200 box displaying a 400x400 square image with cover -> 400x400 centered at y=-100
    const coverRect = computeMediaContentRect(400, 200, 400, 400, 'cover', '50% 50%');
    expect(coverRect).toEqual({ x: 0, y: -100, w: 400, h: 400 });

    // A face in the center (0.25..0.75, 0.25..0.75) projects cleanly into (100, 0, 200, 200)
    const proj = projectRegionToElement({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, coverRect, 400, 200);
    expect(proj).toEqual({ x: 100, y: 0, w: 200, h: 200 });

    // 400x200 box displaying 400x400 with contain -> 200x200 centered at x=100
    const containRect = computeMediaContentRect(400, 200, 400, 400, 'contain', '50% 50%');
    expect(containRect).toEqual({ x: 100, y: 0, w: 200, h: 200 });
  });
});

describe('Vision NMS & Multi-Model Face Merging', () => {
  it('deduplicates overlapping boxes and preserves up to 16 group faces from YuNet', () => {
    const kept = classAwareNms(
      [
        { x: 0.1, y: 0.1, w: 0.2, h: 0.2, label: 'FACE_FEMALE', confidence: 0.9 },
        { x: 0.11, y: 0.11, w: 0.2, h: 0.2, label: 'FACE_MALE', confidence: 0.6 },
        { x: 0.6, y: 0.1, w: 0.2, h: 0.2, label: 'FACE_FEMALE', confidence: 0.85 },
      ],
      0.45
    );
    expect(kept).toHaveLength(2);
    expect(kept[0]?.label).toBe('FACE_FEMALE');

    // Add 10 small faces detected by YuNet beyond HaramBlur's old 2-face cap
    const yunetFaces = Array.from({ length: 10 }, (_, idx) => ({
      x: 0.02 + idx * 0.09,
      y: 0.5,
      w: 0.06,
      h: 0.08,
      score: 0.8,
    }));
    const { merged, faceIndices } = mergeFaceCandidates(kept, yunetFaces, 16);
    expect(merged.length).toBe(12);
    expect(faceIndices.length).toBe(12);
  });
});
