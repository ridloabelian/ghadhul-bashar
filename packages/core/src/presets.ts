import type {
  ExtensionSettings,
  PolicyRuleOverrides,
  ProfileId,
  SensitivityLevel,
} from './types.js';

export const PROFILE_OVERRIDES: Record<ProfileId, PolicyRuleOverrides> = {
  brothers: {
    blurFemaleFace: true,
    blurMaleFace: false,
    blurAwrahBody: true,
    blurExposedNudity: true,
    exemptChildrenUnderAge: 10,
    autoEscalateNsfw: true,
  },
  sisters: {
    blurFemaleFace: false,
    blurMaleFace: true,
    blurAwrahBody: true,
    blurExposedNudity: true,
    exemptChildrenUnderAge: 10,
    autoEscalateNsfw: true,
  },
  family: {
    blurFemaleFace: false,
    blurMaleFace: false,
    blurAwrahBody: true,
    blurExposedNudity: true,
    exemptChildrenUnderAge: 10,
    autoEscalateNsfw: true,
  },
  strict: {
    blurFemaleFace: true,
    blurMaleFace: true,
    blurAwrahBody: true,
    blurExposedNudity: true,
    exemptChildrenUnderAge: 10,
    autoEscalateNsfw: true,
  },
  'nsfw-only': {
    blurFemaleFace: false,
    blurMaleFace: false,
    blurAwrahBody: false,
    blurExposedNudity: true,
    exemptChildrenUnderAge: 10,
    autoEscalateNsfw: true,
  },
};

export interface SensitivityThresholds {
  faceConfidence: number;
  bodyConfidence: number;
  nudityConfidence: number;
  nsfwEscalation: number;
  paddingRatio: number;
}

export const SENSITIVITY_THRESHOLDS: Record<SensitivityLevel, SensitivityThresholds> = {
  relaxed: {
    faceConfidence: 0.42,
    bodyConfidence: 0.36,
    nudityConfidence: 0.28,
    nsfwEscalation: 0.65,
    paddingRatio: 0.1,
  },
  balanced: {
    faceConfidence: 0.30,
    bodyConfidence: 0.25,
    nudityConfidence: 0.20,
    nsfwEscalation: 0.50,
    paddingRatio: 0.12,
  },
  strict: {
    faceConfidence: 0.20,
    bodyConfidence: 0.18,
    nudityConfidence: 0.14,
    nsfwEscalation: 0.35,
    paddingRatio: 0.16,
  },
};

export function createDefaultSettings(): ExtensionSettings {
  return {
    enabled: true,
    onboardingCompleted: false,
    profile: 'brothers',
    maskStyle: 'surgical-frosted',
    sensitivity: 'balanced',
    blurIntensityPx: 22,
    grayscaleMask: true,
    zeroFlashShield: true,
    failClosedOnError: true,
    autoMuteOnBlur: true,
    altHoverPeek: false,
    locale: 'id',
    whitelist: [],
    overrides: { ...PROFILE_OVERRIDES.brothers },
    timeLock: {
      lockedUntilMs: 0,
      cooldownDurationMs: 60 * 60 * 1000,
      pendingUnlockAtMs: 0,
      pinHashHex: null,
      pinSaltHex: null,
    },
  };
}

export function applyProfilePreset(
  settings: ExtensionSettings,
  profile: ProfileId
): ExtensionSettings {
  return {
    ...settings,
    profile,
    overrides: { ...PROFILE_OVERRIDES[profile] },
  };
}
