import {
  applyProfilePreset,
  createDefaultSettings,
  type ExtensionSettings,
} from '@ghadhul-bashar/core';

const STORAGE_KEY = 'gb_settings_v1';

export function normalizeHostname(urlOrHost: string): string {
  try {
    const raw = urlOrHost.includes('://') ? new URL(urlOrHost).hostname : urlOrHost;
    return raw.toLowerCase().replace(/^www\./, '');
  } catch {
    return urlOrHost.toLowerCase().replace(/^www\./, '');
  }
}

export async function loadSettings(): Promise<ExtensionSettings> {
  const res = await chrome.storage.local.get(STORAGE_KEY);
  const stored = res[STORAGE_KEY] as Partial<ExtensionSettings> | undefined;
  const base = createDefaultSettings();
  if (!stored) {
    await chrome.storage.local.set({ [STORAGE_KEY]: base });
    return base;
  }

  const profile = stored.profile ?? base.profile;
  const defaultWithProfile = applyProfilePreset(base, profile);
  return {
    ...defaultWithProfile,
    ...stored,
    overrides: {
      ...defaultWithProfile.overrides,
      ...(stored.overrides ?? {}),
    },
    timeLock: {
      ...base.timeLock,
      ...(stored.timeLock ?? {}),
    },
    whitelist: Array.isArray(stored.whitelist) ? stored.whitelist : [],
  };
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: settings });
}
