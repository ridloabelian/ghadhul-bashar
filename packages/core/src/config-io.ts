import { applyProfilePreset, createDefaultSettings } from './presets.js';
import type {
  ExtensionSettings,
  LocaleCode,
  MaskStyle,
  PolicyRuleOverrides,
  ProfileId,
  SensitivityLevel,
} from './types.js';

export interface ExportedConfigPayload {
  app: 'ghadhul-bashar';
  schemaVersion: 1;
  exportedAt: string;
  settings: Omit<ExtensionSettings, 'timeLock'>;
}

const VALID_PROFILES = new Set<ProfileId>(['brothers', 'sisters', 'family', 'strict', 'nsfw-only']);
const VALID_MASK_STYLES = new Set<MaskStyle>([
  'surgical-frosted',
  'surgical-ambient',
  'surgical-pixelate',
  'whole-blur',
]);
const VALID_SENSITIVITIES = new Set<SensitivityLevel>(['relaxed', 'balanced', 'strict']);
const VALID_LOCALES = new Set<LocaleCode>(['id', 'en', 'ar']);

const MAX_WHITELIST_ENTRIES = 500;

/** Normalizes a URL or raw hostname to a lowercase domain without leading `www.` or port. */
export function normalizeDomain(urlOrHost: string): string {
  const trimmed = urlOrHost.trim();
  if (!trimmed) return '';
  try {
    const raw = trimmed.includes('://') ? new URL(trimmed).hostname : trimmed.split('/')[0] ?? '';
    return raw.split(':')[0]!.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  } catch {
    return trimmed.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  }
}

/** Matches exact domains and subdomains (e.g. `news.example.com` matches `example.com`). */
export function isHostnameWhitelisted(hostname: string, whitelist: string[]): boolean {
  const norm = normalizeDomain(hostname);
  if (!norm) return false;
  for (const entry of whitelist) {
    const clean = normalizeDomain(entry);
    if (!clean) continue;
    if (norm === clean || norm.endsWith(`.${clean}`)) {
      return true;
    }
  }
  return false;
}

/**
 * Exports extension settings as formatted JSON while stripping sensitive
 * offline Time-Lock / Partner PIN hashes and salts.
 */
export function exportSettingsJson(settings: ExtensionSettings): string {
  const { timeLock: _stripped, ...portable } = settings;
  const payload: ExportedConfigPayload = {
    app: 'ghadhul-bashar',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    settings: portable,
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Parses and strictly validates an imported JSON configuration while preserving
 * the active `timeLock` state so config import can never bypass Time-Lock/PIN.
 */
export function parseAndValidateImport(
  jsonText: string,
  current: ExtensionSettings
): ExtensionSettings {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('Invalid JSON configuration file');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Configuration payload must be a JSON object');
  }

  const record = parsed as Record<string, unknown>;
  if (record.app !== 'ghadhul-bashar' || record.schemaVersion !== 1) {
    throw new Error('Unsupported or missing Ghadhul Bashar schemaVersion (expected v1)');
  }

  const rawSettings = record.settings;
  if (!rawSettings || typeof rawSettings !== 'object') {
    throw new Error('Missing settings object in configuration file');
  }

  const s = rawSettings as Record<string, unknown>;
  const base = createDefaultSettings();
  const profile: ProfileId = VALID_PROFILES.has(s.profile as ProfileId)
    ? (s.profile as ProfileId)
    : base.profile;
  const preset = applyProfilePreset(base, profile);

  const maskStyle: MaskStyle = VALID_MASK_STYLES.has(s.maskStyle as MaskStyle)
    ? (s.maskStyle as MaskStyle)
    : preset.maskStyle;
  const sensitivity: SensitivityLevel = VALID_SENSITIVITIES.has(s.sensitivity as SensitivityLevel)
    ? (s.sensitivity as SensitivityLevel)
    : preset.sensitivity;
  const locale: LocaleCode = VALID_LOCALES.has(s.locale as LocaleCode)
    ? (s.locale as LocaleCode)
    : current.locale;

  const rawOverrides =
    s.overrides && typeof s.overrides === 'object'
      ? (s.overrides as Record<string, unknown>)
      : {};
  const overrides: PolicyRuleOverrides = {
    blurFemaleFace: asBool(rawOverrides.blurFemaleFace, preset.overrides.blurFemaleFace),
    blurMaleFace: asBool(rawOverrides.blurMaleFace, preset.overrides.blurMaleFace),
    blurAwrahBody: asBool(rawOverrides.blurAwrahBody, preset.overrides.blurAwrahBody),
    blurExposedNudity: asBool(rawOverrides.blurExposedNudity, preset.overrides.blurExposedNudity),
    exemptChildrenUnderAge: clampInt(
      rawOverrides.exemptChildrenUnderAge,
      preset.overrides.exemptChildrenUnderAge,
      0,
      15
    ),
    autoEscalateNsfw: asBool(rawOverrides.autoEscalateNsfw, preset.overrides.autoEscalateNsfw),
  };

  const whitelistSet = new Set<string>();
  if (Array.isArray(s.whitelist)) {
    for (const item of s.whitelist) {
      if (typeof item !== 'string') continue;
      const domain = normalizeDomain(item);
      if (domain && /^[a-z0-9.-]+$/.test(domain)) {
        whitelistSet.add(domain);
        if (whitelistSet.size >= MAX_WHITELIST_ENTRIES) break;
      }
    }
  }

  return {
    enabled: asBool(s.enabled, true),
    onboardingCompleted: true,
    profile,
    maskStyle,
    sensitivity,
    blurIntensityPx: clampInt(s.blurIntensityPx, preset.blurIntensityPx, 10, 48),
    grayscaleMask: asBool(s.grayscaleMask, preset.grayscaleMask),
    zeroFlashShield: asBool(s.zeroFlashShield, preset.zeroFlashShield),
    failClosedOnError: asBool(s.failClosedOnError, preset.failClosedOnError),
    autoMuteOnBlur: asBool(s.autoMuteOnBlur, preset.autoMuteOnBlur),
    altHoverPeek: asBool(s.altHoverPeek, preset.altHoverPeek),
    locale,
    whitelist: Array.from(whitelistSet),
    overrides,
    // Always preserve active Time-Lock & PIN state across imports
    timeLock: { ...current.timeLock },
  };
}
