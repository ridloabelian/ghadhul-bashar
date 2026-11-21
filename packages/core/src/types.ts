/** Core domain types shared across policy, vision, background, and content scripts. */

export type BodyPartClass =
  | 'FACE_FEMALE'
  | 'FACE_MALE'
  | 'FACE_CHILD'
  | 'FEMALE_BREAST_EXPOSED'
  | 'FEMALE_BREAST_COVERED'
  | 'MALE_BREAST_EXPOSED'
  | 'FEMALE_GENITALIA_EXPOSED'
  | 'FEMALE_GENITALIA_COVERED'
  | 'MALE_GENITALIA_EXPOSED'
  | 'BUTTOCKS_EXPOSED'
  | 'BUTTOCKS_COVERED'
  | 'BELLY_EXPOSED'
  | 'BELLY_COVERED'
  | 'ARMPITS_EXPOSED'
  | 'ARMPITS_COVERED'
  | 'FEET_EXPOSED'
  | 'FEET_COVERED'
  | 'ANUS_EXPOSED'
  | 'ANUS_COVERED';

export type ProfileId = 'brothers' | 'sisters' | 'family' | 'strict' | 'nsfw-only';

export type MaskStyle =
  | 'surgical-frosted'
  | 'surgical-ambient'
  | 'surgical-pixelate'
  | 'whole-blur';

export type SensitivityLevel = 'relaxed' | 'balanced' | 'strict';

export type LocaleCode = 'id' | 'en' | 'ar';

export interface RegionBox {
  /** Normalized top-left coordinates and dimensions in [0, 1] relative to intrinsic media. */
  x: number;
  y: number;
  w: number;
  h: number;
  label: BodyPartClass;
  confidence: number;
  estimatedAge?: number;
  trackId?: number;
}

export interface RawDetectionOutput {
  regions: RegionBox[];
  nsfwScore: number;
  ambientColor: [number, number, number];
  backend: 'webgpu' | 'wasm' | 'heuristic';
  latencyMs: number;
}

export interface DetectionVerdict {
  action: 'clear' | 'surgical-mask' | 'full-mask';
  regions: RegionBox[];
  nsfwScore: number;
  ambientColor: [number, number, number];
  fromCache: boolean;
  latencyMs: number;
  backend: 'webgpu' | 'wasm' | 'heuristic';
}

export interface PolicyRuleOverrides {
  blurFemaleFace: boolean;
  blurMaleFace: boolean;
  blurAwrahBody: boolean;
  blurExposedNudity: boolean;
  exemptChildrenUnderAge: number;
  autoEscalateNsfw: boolean;
}

export interface TimeLockState {
  /** Epoch milliseconds until which protection weakening/disabling is locked. 0 means unlocked. */
  lockedUntilMs: number;
  cooldownDurationMs: number;
  pendingUnlockAtMs: number;
  /** PBKDF2-SHA-256 hex digest + salt hex for offline Partner PIN. */
  pinHashHex: string | null;
  pinSaltHex: string | null;
}

export interface ExtensionSettings {
  enabled: boolean;
  onboardingCompleted: boolean;
  profile: ProfileId;
  maskStyle: MaskStyle;
  sensitivity: SensitivityLevel;
  blurIntensityPx: number;
  grayscaleMask: boolean;
  zeroFlashShield: boolean;
  failClosedOnError: boolean;
  autoMuteOnBlur: boolean;
  altHoverPeek: boolean;
  locale: LocaleCode;
  whitelist: string[];
  overrides: PolicyRuleOverrides;
  timeLock: TimeLockState;
}

export interface TabTelemetry {
  checkedCount: number;
  maskedCount: number;
  cacheHitCount: number;
  avgLatencyMs: number;
  backend: 'webgpu' | 'wasm' | 'heuristic' | 'idle';
}
