import type {
  DetectionVerdict,
  ExtensionSettings,
  ProfileId,
  RawDetectionOutput,
  RegionBox,
  TabTelemetry,
} from '@ghadhul-bashar/core';

export type RuntimeRequest =
  | { type: 'GB_GET_SETTINGS' }
  | { type: 'GB_CHECK_FRAME'; frameUrl: string }
  | { type: 'GB_UPDATE_SETTINGS'; next: ExtensionSettings; pin?: string }
  | { type: 'GB_APPLY_PROFILE'; profile: ProfileId; pin?: string; completeOnboarding?: boolean }
  | { type: 'GB_TOGGLE_SITE'; hostname: string; pin?: string }
  | { type: 'GB_IMPORT_SETTINGS'; jsonText: string; pin?: string }
  | { type: 'GB_CLEAR_CACHE' }
  | { type: 'GB_START_COOLDOWN' }
  | { type: 'GB_ACTIVATE_TIMELOCK'; durationMs: number }
  | { type: 'GB_SET_PIN'; pin: string }
  | { type: 'GB_UNLOCK_PIN'; pin: string }
  | { type: 'GB_ANALYZE_URL'; url: string; priority?: number }
  | { type: 'GB_ANALYZE_FRAME'; dataUrl: string; cacheKey?: string; isVideoKeyframe?: boolean; priority?: number }
  | { type: 'GB_CAPTURE_AND_ANALYZE_RECT'; rect: { x: number; y: number; w: number; h: number }; dpr: number }
  | { type: 'GB_BENCHMARK_ANALYZE'; dataUrl: string; cascadeMode: 'adaptive' | 'legacy-full' }
  | { type: 'GB_OFFSCREEN_ANALYZE_URL'; url: string; priority: number }
  | { type: 'GB_OFFSCREEN_ANALYZE_FRAME'; dataUrl: string; cacheKey?: string; isVideoKeyframe?: boolean; priority: number }
  | { type: 'GB_OFFSCREEN_CLEAR_CACHE' }
  | { type: 'GB_OFFSCREEN_BENCHMARK_ANALYZE'; dataUrl: string; cascadeMode: 'adaptive' | 'legacy-full' }
  | { type: 'GB_GET_TAB_TELEMETRY'; tabId?: number }
  | { type: 'GB_REPORT_TELEMETRY'; deltaChecked?: number; maskedDelta?: number; cacheHit?: boolean; latencyMs?: number; backend?: TabTelemetry['backend'] }
  | { type: 'GB_GET_ENGINE_STATUS' }
  | { type: 'GB_PING' };

export interface AnalyzeResponse {
  ok: boolean;
  verdict?: DetectionVerdict;
  raw?: RawDetectionOutput;
  fromCache?: boolean;
  error?: string;
}

export interface UpdateSettingsResponse {
  ok: boolean;
  settings?: ExtensionSettings;
  error?: 'LOCKED' | 'INVALID_PIN' | 'INVALID_CONFIG' | 'UNKNOWN';
}

export interface FrameAllowedResponse {
  enabled: boolean;
  whitelisted: boolean;
  hostname: string;
  settings: ExtensionSettings;
}

export type ContentPushMessage =
  | { type: 'GB_SETTINGS_CHANGED'; settings: ExtensionSettings }
  | { type: 'GB_MANUAL_OVERRIDE'; mode: 'mask' | 'reveal'; selector?: string; regions?: RegionBox[] };
