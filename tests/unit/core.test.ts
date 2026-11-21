import { describe, expect, it } from 'vitest';
import {
  applyProfilePreset,
  computeDHash64,
  computeLuma16x16,
  createDefaultSettings,
  derivePinHash,
  detectSceneCut,
  DHashLRUCache,
  evaluatePolicy,
  hammingDistanceHex,
  isTimeLocked,
  isWeakeningChange,
  RegionTracker,
  startUnlockCooldown,
  TRANSLATIONS,
  verifyPartnerPin,
} from '../../packages/core/src/index.js';
import type { RawDetectionOutput } from '../../packages/core/src/index.js';

function makeRaw(overrides: Partial<RawDetectionOutput> = {}): RawDetectionOutput {
  return {
    regions: [],
    nsfwScore: 0.02,
    ambientColor: [30, 40, 50],
    backend: 'wasm',
    latencyMs: 12,
    ...overrides,
  };
}

describe('Fiqh Policy Matrix & Child Exemption', () => {
  it('applies Brothers profile: blurs adult female face, exempts children < 10, skips male face', () => {
    const settings = createDefaultSettings();
    const raw = makeRaw({
      regions: [
        { x: 0.1, y: 0.1, w: 0.2, h: 0.2, label: 'FACE_FEMALE', confidence: 0.85, estimatedAge: 24 },
        { x: 0.4, y: 0.1, w: 0.2, h: 0.2, label: 'FACE_FEMALE', confidence: 0.85, estimatedAge: 6 },
        { x: 0.7, y: 0.1, w: 0.2, h: 0.2, label: 'FACE_MALE', confidence: 0.88, estimatedAge: 30 },
      ],
    });
    const verdict = evaluatePolicy(raw, settings);
    expect(verdict.action).toBe('surgical-mask');
    expect(verdict.regions).toHaveLength(1);
    expect(verdict.regions[0]?.label).toBe('FACE_FEMALE');
    // Padding should slightly expand the box while keeping surrounding region unblurred
    expect(verdict.regions[0]!.w).toBeGreaterThan(0.2);
  });

  it('applies Sisters profile: masks adult male face and exposed awrah while leaving female face clear', () => {
    const settings = applyProfilePreset(createDefaultSettings(), 'sisters');
    const raw = makeRaw({
      regions: [
        { x: 0.05, y: 0.1, w: 0.18, h: 0.18, label: 'FACE_FEMALE', confidence: 0.9, estimatedAge: 25 },
        { x: 0.35, y: 0.1, w: 0.18, h: 0.18, label: 'FACE_MALE', confidence: 0.85, estimatedAge: 28 },
        { x: 0.65, y: 0.4, w: 0.2, h: 0.2, label: 'MALE_BREAST_EXPOSED', confidence: 0.75 },
      ],
    });
    const verdict = evaluatePolicy(raw, settings);
    expect(verdict.action).toBe('surgical-mask');
    expect(verdict.regions.map((r) => r.label)).toEqual(['FACE_MALE', 'MALE_BREAST_EXPOSED']);
  });

  it('applies Family profile: keeps modestly dressed adult faces clear, masks exposed awrah', () => {
    const settings = applyProfilePreset(createDefaultSettings(), 'family');
    const raw = makeRaw({
      regions: [
        { x: 0.1, y: 0.1, w: 0.15, h: 0.15, label: 'FACE_FEMALE', confidence: 0.92, estimatedAge: 30 },
        { x: 0.1, y: 0.4, w: 0.2, h: 0.2, label: 'BELLY_EXPOSED', confidence: 0.8 },
      ],
    });
    const verdict = evaluatePolicy(raw, settings);
    expect(verdict.action).toBe('surgical-mask');
    expect(verdict.regions.map((r) => r.label)).toEqual(['BELLY_EXPOSED']);
  });

  it('applies Strict profile: masks all adult faces and exempts young children', () => {
    const settings = applyProfilePreset(createDefaultSettings(), 'strict');
    const raw = makeRaw({
      regions: [
        { x: 0.1, y: 0.1, w: 0.15, h: 0.15, label: 'FACE_FEMALE', confidence: 0.8, estimatedAge: 25 },
        { x: 0.4, y: 0.1, w: 0.15, h: 0.15, label: 'FACE_MALE', confidence: 0.8, estimatedAge: 27 },
        { x: 0.7, y: 0.1, w: 0.15, h: 0.15, label: 'FACE_MALE', confidence: 0.8, estimatedAge: 5 },
      ],
    });
    const verdict = evaluatePolicy(raw, settings);
    expect(verdict.action).toBe('surgical-mask');
    expect(verdict.regions).toHaveLength(2);
  });

  it('escalates to full-mask on high NSFW score or >55% surgical area coverage', () => {
    const settings = applyProfilePreset(createDefaultSettings(), 'nsfw-only');
    const nsfwVerdict = evaluatePolicy(makeRaw({ nsfwScore: 0.72 }), settings);
    expect(nsfwVerdict.action).toBe('full-mask');

    const bro = createDefaultSettings();
    const giantFace = evaluatePolicy(
      makeRaw({
        regions: [{ x: 0.05, y: 0.05, w: 0.8, h: 0.8, label: 'FACE_FEMALE', confidence: 0.9 }],
      }),
      bro
    );
    expect(giantFace.action).toBe('full-mask');
  });
});

describe('Perceptual dHash64 & LRU Cache', () => {
  it('produces identical/near-identical hashes for scaled brightness shifts and differentiates distinct patterns', () => {
    const gradA = new Uint8ClampedArray(9 * 8 * 4);
    const gradB = new Uint8ClampedArray(9 * 8 * 4);
    const inv = new Uint8ClampedArray(9 * 8 * 4);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 9; x++) {
        const idx = (y * 9 + x) * 4;
        const valA = Math.min(255, x * 28 + y * 2);
        const valB = Math.min(255, Math.round(valA * 0.9) + 10);
        const valInv = Math.max(0, 255 - x * 28);
        gradA[idx] = gradA[idx + 1] = gradA[idx + 2] = valA;
        gradB[idx] = gradB[idx + 1] = gradB[idx + 2] = valB;
        inv[idx] = inv[idx + 1] = inv[idx + 2] = valInv;
        gradA[idx + 3] = gradB[idx + 3] = inv[idx + 3] = 255;
      }
    }

    const hA = computeDHash64(gradA);
    const hB = computeDHash64(gradB);
    const hInv = computeDHash64(inv);

    expect(hammingDistanceHex(hA, hB)).toBeLessThanOrEqual(2);
    expect(hammingDistanceHex(hA, hInv)).toBeGreaterThan(20);

    const cache = new DHashLRUCache<string>(10);
    cache.set(hA, 'cached-verdict');
    expect(cache.findSimilar(hB, 2)).toBe('cached-verdict');
  });
});

describe('60 FPS Kalman Tracker & 16x16 Scene-Cut Detector', () => {
  it('detects abrupt scene cuts accurately and ignores smooth frame deltas', () => {
    const frame1 = new Uint8Array(64 * 64 * 4).fill(20);
    const frame2 = new Uint8Array(64 * 64 * 4).fill(28);
    const frame3 = new Uint8Array(64 * 64 * 4).fill(220);

    const l1 = computeLuma16x16(frame1, 64, 64);
    const l2 = computeLuma16x16(frame2, 64, 64);
    const l3 = computeLuma16x16(frame3, 64, 64);

    expect(detectSceneCut(l1, l2)).toBe(false);
    expect(detectSceneCut(l2, l3)).toBe(true);
  });

  it('interpolates moving target smoothly between keyframes and absorbs brief misses', () => {
    const tracker = new RegionTracker(2, 0.2);
    tracker.update([{ x: 0.2, y: 0.2, w: 0.2, h: 0.2, label: 'FACE_FEMALE', confidence: 0.9 }], 1000);
    tracker.update([{ x: 0.3, y: 0.2, w: 0.2, h: 0.2, label: 'FACE_FEMALE', confidence: 0.9 }], 1200);

    const predicted = tracker.predict(1300);
    expect(predicted).toHaveLength(1);
    expect(predicted[0]!.x).toBeGreaterThan(0.3);
    expect(predicted[0]!.trackId).toBe(1);

    // One missed keyframe still preserves box to eliminate flicker
    const afterMiss = tracker.update([], 1400);
    expect(afterMiss).toHaveLength(1);
  });
});

describe('Offline Time-Lock & Partner PIN Security', () => {
  it('hashes and verifies Partner PIN offline with PBKDF2-SHA-256 and detects weakening changes', async () => {
    const settings = createDefaultSettings();
    const { hashHex, saltHex } = await derivePinHash('4829');
    const lockedSettings = {
      ...settings,
      timeLock: {
        ...settings.timeLock,
        lockedUntilMs: Date.now() + 60_000,
        pinHashHex: hashHex,
        pinSaltHex: saltHex,
      },
    };

    expect(isTimeLocked(lockedSettings.timeLock)).toBe(true);
    expect(await verifyPartnerPin('4829', lockedSettings.timeLock)).toBe(true);
    expect(await verifyPartnerPin('0000', lockedSettings.timeLock)).toBe(false);

    const disabledAttempt = { ...lockedSettings, enabled: false };
    const strictAttempt = applyProfilePreset(lockedSettings, 'strict');
    expect(isWeakeningChange(lockedSettings, disabledAttempt)).toBe(true);
    expect(isWeakeningChange(lockedSettings, strictAttempt)).toBe(false);

    const cd = startUnlockCooldown(settings.timeLock, 1_000_000);
    expect(cd.pendingUnlockAtMs).toBeGreaterThan(1_000_000);
  });
});

describe('i18n Localization (ID / EN / AR RTL)', () => {
  it('ships complete Indonesian, English, and RTL Arabic dictionaries', () => {
    expect(TRANSLATIONS.id.isRtl).toBe(false);
    expect(TRANSLATIONS.en.isRtl).toBe(false);
    expect(TRANSLATIONS.ar.isRtl).toBe(true);
    expect(TRANSLATIONS.id.arabicTitle).toBe('غض البصر');
  });
});
