import { describe, expect, it } from 'vitest';
import {
  applyProfilePreset,
  createDefaultSettings,
  exportSettingsJson,
  isHostnameWhitelisted,
  isWeakeningChange,
  normalizeDomain,
  parseAndValidateImport,
} from '../../packages/core/src/index.js';
import {
  computeOutsideFaceSkin,
  profileVisualSignals,
} from '../../packages/vision/src/index.js';

function make64x64(pixelFn: (x: number, y: number) => [number, number, number]): Uint8Array {
  const buf = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const [r, g, b] = pixelFn(x, y);
      const i = (y * 64 + x) * 4;
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = 255;
    }
  }
  return buf;
}

describe('Adaptive Cascade Visual Signal Profiler', () => {
  it('skips flat/gradient UI banners as trivial graphics', () => {
    const flatGrad = make64x64((x, y) => [15 + (x >> 2), 30 + (y >> 2), 45]);
    const sig = profileVisualSignals(flatGrad);
    expect(sig.isTrivialGraphic).toBe(true);
    expect(sig.skinRatio).toBeLessThan(0.01);
  });

  it('distinguishes clean clothed headshots from exposed-body scenes', () => {
    const drawHead = (bodyRgb: [number, number, number]) =>
      make64x64((x, y) => {
        if (x >= 20 && x <= 44 && y >= 8 && y <= 32) {
          return [220, 168, 138]; // photographic skin inside face box
        }
        if (y >= 38 && x >= 12 && x <= 52) {
          return bodyRgb;
        }
        return [22, 34, 48];
      });

    const faceBox = [{ x: 20 / 64, y: 8 / 64, w: 24 / 64, h: 24 / 64 }];
    const cleanHeadshot = computeOutsideFaceSkin(drawHead([24, 32, 44]), faceBox);
    const exposedBody = computeOutsideFaceSkin(drawHead([215, 162, 132]), faceBox);

    expect(cleanHeadshot.outsideSkinRatio).toBeLessThan(0.02);
    expect(exposedBody.outsideSkinRatio).toBeGreaterThan(0.16);
  });

  it('flags anime pastel flesh and B&W manga screentones for Marqo NSFW verification', () => {
    // Pale cel-shaded anime tone [224, 218, 210] (outside photo YCbCr Cr>=133 -> caught by animeSkinRatio)
    const animeBuf = make64x64((x, y) =>
      x >= 16 && x <= 48 && y >= 12 && y <= 52 ? [224, 218, 210] : [25, 30, 60]
    );
    const mangaBuf = make64x64((x, y) => ((x + y) % 4 === 0 ? [12, 12, 12] : [245, 245, 245]));

    const animeSig = profileVisualSignals(animeBuf);
    const mangaSig = profileVisualSignals(mangaBuf);

    expect(animeSig.isTrivialGraphic).toBe(false);
    expect(animeSig.animeSkinRatio).toBeGreaterThan(0.07);
    expect(mangaSig.isTrivialGraphic).toBe(false);
    expect(mangaSig.mangaLineArtSignal).toBe(true);
  });
});

describe('Config Export/Import, Domain Whitelisting & Strengthened Time-Lock', () => {
  it('strips Partner PIN hashes on export and preserves active Time-Lock on import', () => {
    const active = {
      ...applyProfilePreset(createDefaultSettings(), 'strict'),
      blurIntensityPx: 30,
      whitelist: ['quran.com'],
      timeLock: {
        lockedUntilMs: Date.now() + 60_000,
        cooldownDurationMs: 3_600_000,
        pendingUnlockAtMs: 0,
        pinHashHex: 'deadbeef'.repeat(8),
        pinSaltHex: 'cafebabe'.repeat(4),
      },
    };

    const json = exportSettingsJson(active);
    expect(json).not.toContain('deadbeef');
    expect(json).not.toContain('cafebabe');

    // Attempt importing tampered bounds + malicious timeLock field
    const forgedPayload = JSON.stringify({
      app: 'ghadhul-bashar',
      schemaVersion: 1,
      settings: {
        enabled: false,
        profile: 'brothers',
        maskStyle: 'surgical-ambient',
        sensitivity: 'balanced',
        blurIntensityPx: 999,
        whitelist: ['https://WWW.Example.COM/path', 'quran.com'],
        overrides: { exemptChildrenUnderAge: 99 },
        timeLock: { lockedUntilMs: 0, pinHashHex: null },
      },
    });

    const imported = parseAndValidateImport(forgedPayload, active);
    expect(imported.blurIntensityPx).toBe(48);
    expect(imported.overrides.exemptChildrenUnderAge).toBe(15);
    expect(imported.whitelist).toEqual(['example.com', 'quran.com']);
    // TimeLock must remain preserved from active settings
    expect(imported.timeLock.pinHashHex).toBe(active.timeLock.pinHashHex);
    expect(imported.timeLock.lockedUntilMs).toBe(active.timeLock.lockedUntilMs);
  });

  it('matches subdomains cleanly and blocks whitelist swapping or raising child age under Time-Lock', () => {
    expect(normalizeDomain('https://www.Docs.Example.com:8443/a')).toBe('docs.example.com');
    expect(isHostnameWhitelisted('news.example.com', ['example.com'])).toBe(true);
    expect(isHostnameWhitelisted('notexample.com', ['example.com'])).toBe(false);

    const curr = { ...createDefaultSettings(), whitelist: ['a.com'] };
    const swapped = { ...curr, whitelist: ['b.com'] };
    const raisedChildAge = {
      ...curr,
      overrides: { ...curr.overrides, exemptChildrenUnderAge: 14 },
    };

    expect(isWeakeningChange(curr, swapped)).toBe(true);
    expect(isWeakeningChange(curr, raisedChildAge)).toBe(true);
  });
});
