import { SENSITIVITY_THRESHOLDS } from './presets.js';
import type {
  BodyPartClass,
  DetectionVerdict,
  ExtensionSettings,
  RawDetectionOutput,
  RegionBox,
} from './types.js';

const EXPOSED_NUDITY_CLASSES = new Set<BodyPartClass>([
  'FEMALE_BREAST_EXPOSED',
  'FEMALE_GENITALIA_EXPOSED',
  'MALE_GENITALIA_EXPOSED',
  'BUTTOCKS_EXPOSED',
  'ANUS_EXPOSED',
]);

const AWRAH_BODY_CLASSES = new Set<BodyPartClass>([
  'FEMALE_BREAST_EXPOSED',
  'FEMALE_BREAST_COVERED',
  'MALE_BREAST_EXPOSED',
  'FEMALE_GENITALIA_EXPOSED',
  'FEMALE_GENITALIA_COVERED',
  'MALE_GENITALIA_EXPOSED',
  'BUTTOCKS_EXPOSED',
  'BUTTOCKS_COVERED',
  'BELLY_EXPOSED',
  'ARMPITS_EXPOSED',
  'ANUS_EXPOSED',
]);

const MAX_SURGICAL_COVERAGE = 0.55;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function padBox(box: RegionBox, ratio: number): RegionBox {
  const padW = box.w * ratio;
  const padH = box.h * ratio;
  const x = clamp01(box.x - padW / 2);
  const y = clamp01(box.y - padH / 2);
  const right = clamp01(box.x + box.w + padW / 2);
  const bottom = clamp01(box.y + box.h + padH / 2);
  return {
    ...box,
    x,
    y,
    w: Math.max(0, right - x),
    h: Math.max(0, bottom - y),
  };
}

function isSevereNudity(label: BodyPartClass): boolean {
  return EXPOSED_NUDITY_CLASSES.has(label);
}

/**
 * Evaluates raw AI detections against the user's active Fiqh/modesty profile
 * and returns deterministic regional or full-cover masking instructions.
 */
export function evaluatePolicy(
  raw: RawDetectionOutput,
  settings: ExtensionSettings,
  fromCache = false
): DetectionVerdict {
  if (!settings.enabled) {
    return {
      action: 'clear',
      regions: [],
      nsfwScore: raw.nsfwScore,
      ambientColor: raw.ambientColor,
      fromCache,
      latencyMs: raw.latencyMs,
      backend: raw.backend,
    };
  }

  const thresh = SENSITIVITY_THRESHOLDS[settings.sensitivity];
  const { overrides } = settings;
  const maskedRegions: RegionBox[] = [];
  let hasSevereNudity = false;

  for (const candidate of raw.regions) {
    // Reclassify faces below the exemption age threshold as children.
    let label = candidate.label;
    if (
      (label === 'FACE_FEMALE' || label === 'FACE_MALE') &&
      candidate.estimatedAge !== undefined &&
      candidate.estimatedAge < overrides.exemptChildrenUnderAge
    ) {
      label = 'FACE_CHILD';
    }

    if (label === 'FACE_CHILD') {
      continue;
    }

    if (label === 'FACE_FEMALE') {
      if (!overrides.blurFemaleFace || candidate.confidence < thresh.faceConfidence) continue;
      maskedRegions.push(padBox({ ...candidate, label }, thresh.paddingRatio));
      continue;
    }

    if (label === 'FACE_MALE') {
      if (!overrides.blurMaleFace || candidate.confidence < thresh.faceConfidence) continue;
      maskedRegions.push(padBox({ ...candidate, label }, thresh.paddingRatio));
      continue;
    }

    if (isSevereNudity(label)) {
      if (overrides.blurExposedNudity && candidate.confidence >= thresh.nudityConfidence) {
        hasSevereNudity = true;
        maskedRegions.push(padBox({ ...candidate, label }, thresh.paddingRatio));
      }
      continue;
    }

    if (AWRAH_BODY_CLASSES.has(label)) {
      if (overrides.blurAwrahBody && candidate.confidence >= thresh.bodyConfidence) {
        maskedRegions.push(padBox({ ...candidate, label }, thresh.paddingRatio));
      }
    }
  }

  const nsfwTriggered =
    overrides.autoEscalateNsfw && raw.nsfwScore >= thresh.nsfwEscalation;

  if (maskedRegions.length === 0 && !nsfwTriggered) {
    return {
      action: 'clear',
      regions: [],
      nsfwScore: raw.nsfwScore,
      ambientColor: raw.ambientColor,
      fromCache,
      latencyMs: raw.latencyMs,
      backend: raw.backend,
    };
  }

  const coveredArea = maskedRegions.reduce((acc, r) => acc + r.w * r.h, 0);
  const shouldEscalateFull =
    settings.maskStyle === 'whole-blur' ||
    nsfwTriggered ||
    hasSevereNudity ||
    coveredArea > MAX_SURGICAL_COVERAGE;

  return {
    action: shouldEscalateFull ? 'full-mask' : 'surgical-mask',
    regions: maskedRegions,
    nsfwScore: raw.nsfwScore,
    ambientColor: raw.ambientColor,
    fromCache,
    latencyMs: raw.latencyMs,
    backend: raw.backend,
  };
}
