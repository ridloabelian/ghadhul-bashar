import {
  isHostnameWhitelisted,
  isTimeLocked,
  TRANSLATIONS,
  type ExtensionSettings,
  type LocaleCode,
  type MaskStyle,
  type ProfileId,
  type SensitivityLevel,
  type TabTelemetry,
} from '@ghadhul-bashar/core';
import type { RuntimeRequest, UpdateSettingsResponse } from '../shared/messages.js';
import { normalizeHostname } from '../shared/storage.js';

let currentSettings: ExtensionSettings;
let activeHostname = '';
let activeTabId: number | undefined;

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function renderTranslations(locale: LocaleCode): void {
  const dict = TRANSLATIONS[locale];
  document.documentElement.lang = locale;
  document.documentElement.dir = dict.isRtl ? 'rtl' : 'ltr';
  el('appName').textContent = dict.appName;
  el('arabicTitle').textContent = dict.arabicTitle;
  el('tagline').textContent = dict.tagline;
  el('lblChecked').textContent = dict.statsChecked;
  el('lblMasked').textContent = dict.statsMasked;
  el('lblCache').textContent = dict.statsCached;
  el('profileLabel').textContent = dict.profileLabel;
  el('maskStyleLabel').textContent = dict.maskStyleLabel;
  el('sensitivityLabel').textContent = dict.sensitivityLabel;
  el('blurStrengthLabel').textContent = dict.blurStrengthLabel;
  el('autoMuteLabel').textContent = dict.autoMuteLabel;
  el('zeroFlashLabel').textContent = dict.zeroFlashLabel;
  el('selfControlTitle').textContent = dict.selfControlTitle;
  el('openOptionsBtn').textContent = dict.openOptionsBtn;

  const profileButtons = document.querySelectorAll<HTMLButtonElement>('#profileGrid .pill-btn');
  for (const btn of profileButtons) {
    const pid = btn.dataset.profile as ProfileId;
    if (pid && dict.profiles[pid]) {
      btn.textContent = dict.profiles[pid].title;
    }
  }

  const maskSelect = el<HTMLSelectElement>('maskStyleSelect');
  for (const opt of Array.from(maskSelect.options)) {
    const ms = opt.value as MaskStyle;
    if (dict.maskStyles[ms]) opt.textContent = dict.maskStyles[ms];
  }

  const sensSelect = el<HTMLSelectElement>('sensitivitySelect');
  for (const opt of Array.from(sensSelect.options)) {
    const sv = opt.value as SensitivityLevel;
    if (dict.sensitivities[sv]) opt.textContent = dict.sensitivities[sv];
  }
}

function renderState(): void {
  const dict = TRANSLATIONS[currentSettings.locale];
  renderTranslations(currentSettings.locale);

  el<HTMLSelectElement>('localeSelect').value = currentSettings.locale;
  el('statusText').textContent = currentSettings.enabled ? dict.statusActive : dict.statusPaused;
  el('siteHost').textContent = activeHostname || '—';

  const globalBtn = el<HTMLButtonElement>('toggleGlobalBtn');
  globalBtn.textContent = currentSettings.enabled ? 'ON' : 'OFF';
  globalBtn.className = currentSettings.enabled ? 'btn btn-primary btn-sm' : 'btn btn-danger btn-sm';

  const isWhitelisted = activeHostname
    ? isHostnameWhitelisted(activeHostname, currentSettings.whitelist)
    : false;
  const siteBtn = el<HTMLButtonElement>('toggleSiteBtn');
  siteBtn.textContent = isWhitelisted ? dict.siteWhitelisted : dict.siteToggleLabel;
  siteBtn.className = isWhitelisted ? 'btn btn-danger btn-sm' : 'btn btn-sm';

  for (const btn of document.querySelectorAll<HTMLButtonElement>('#profileGrid .pill-btn')) {
    btn.classList.toggle('active', btn.dataset.profile === currentSettings.profile);
  }

  el<HTMLSelectElement>('maskStyleSelect').value = currentSettings.maskStyle;
  el<HTMLSelectElement>('sensitivitySelect').value = currentSettings.sensitivity;
  el<HTMLInputElement>('blurRange').value = String(currentSettings.blurIntensityPx);
  el('blurValue').textContent = `${currentSettings.blurIntensityPx}px`;
  el<HTMLInputElement>('autoMuteCheck').checked = currentSettings.autoMuteOnBlur;
  el<HTMLInputElement>('zeroFlashCheck').checked = currentSettings.zeroFlashShield;

  const locked = isTimeLocked(currentSettings.timeLock);
  const lockStatusEl = el('lockStatusText');
  const lockBtn = el<HTMLButtonElement>('lockBtn');
  const pinBtn = el<HTMLButtonElement>('pinActionBtn');
  const banner = el('lockBanner');

  if (currentSettings.timeLock.pinHashHex) {
    lockStatusEl.textContent = dict.lockStatusLocked;
    lockBtn.classList.add('hidden');
    pinBtn.textContent = dict.unlockWithPinBtn;
    banner.textContent = dict.lockedWarning;
    banner.classList.remove('hidden');
  } else if (locked) {
    const mins = Math.max(
      1,
      Math.ceil((currentSettings.timeLock.lockedUntilMs - Date.now()) / 60_000)
    );
    lockStatusEl.textContent = `${dict.lockStatusLocked} (~${mins}m)`;
    lockBtn.textContent = dict.startCooldownBtn;
    lockBtn.classList.remove('hidden');
    pinBtn.textContent = 'Set PIN';
    banner.textContent = dict.lockedWarning;
    banner.classList.remove('hidden');
  } else {
    lockStatusEl.textContent = dict.lockStatusUnlocked;
    lockBtn.textContent = dict.activateLockBtn;
    lockBtn.classList.remove('hidden');
    pinBtn.textContent = 'Set PIN';
    banner.classList.add('hidden');
  }
}

async function sendUpdate(next: ExtensionSettings): Promise<void> {
  const pin = el<HTMLInputElement>('pinInput').value.trim() || undefined;
  const resp = (await chrome.runtime.sendMessage({
    type: 'GB_UPDATE_SETTINGS',
    next,
    pin,
  } satisfies RuntimeRequest)) as UpdateSettingsResponse;

  if (!resp.ok && resp.settings) {
    currentSettings = resp.settings;
    renderState();
    const banner = el('lockBanner');
    banner.textContent = TRANSLATIONS[currentSettings.locale].lockedWarning;
    banner.classList.remove('hidden');
    return;
  }
  if (resp.settings) {
    currentSettings = resp.settings;
    renderState();
  }
}

async function refreshTelemetry(): Promise<void> {
  const stats = (await chrome.runtime.sendMessage({
    type: 'GB_GET_TAB_TELEMETRY',
    tabId: activeTabId,
  } satisfies RuntimeRequest)) as TabTelemetry;

  el('statChecked').textContent = String(stats.checkedCount);
  el('statMasked').textContent = String(stats.maskedCount);
  el('statCache').textContent = String(stats.cacheHitCount);
  el('statLatency').textContent = `${stats.avgLatencyMs}ms`;
  el('lblEngine').textContent = stats.backend === 'webgpu' ? 'WebGPU' : 'WASM';
}

async function init(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTabId = tab?.id;
  activeHostname = tab?.url ? normalizeHostname(tab.url) : '';

  currentSettings = (await chrome.runtime.sendMessage({
    type: 'GB_GET_SETTINGS',
  } satisfies RuntimeRequest)) as ExtensionSettings;

  renderState();
  await refreshTelemetry();

  el<HTMLSelectElement>('localeSelect').addEventListener('change', (ev) => {
    const locale = (ev.target as HTMLSelectElement).value as LocaleCode;
    void sendUpdate({ ...currentSettings, locale });
  });

  el<HTMLButtonElement>('toggleGlobalBtn').addEventListener('click', () => {
    void sendUpdate({ ...currentSettings, enabled: !currentSettings.enabled });
  });

  el<HTMLButtonElement>('toggleSiteBtn').addEventListener('click', async () => {
    if (!activeHostname) return;
    const pin = el<HTMLInputElement>('pinInput').value.trim() || undefined;
    const resp = (await chrome.runtime.sendMessage({
      type: 'GB_TOGGLE_SITE',
      hostname: activeHostname,
      pin,
    } satisfies RuntimeRequest)) as UpdateSettingsResponse;
    if (resp.settings) {
      currentSettings = resp.settings;
      renderState();
    }
  });

  for (const btn of document.querySelectorAll<HTMLButtonElement>('#profileGrid .pill-btn')) {
    btn.addEventListener('click', async () => {
      const profile = btn.dataset.profile as ProfileId;
      const pin = el<HTMLInputElement>('pinInput').value.trim() || undefined;
      const resp = (await chrome.runtime.sendMessage({
        type: 'GB_APPLY_PROFILE',
        profile,
        pin,
      } satisfies RuntimeRequest)) as UpdateSettingsResponse;
      if (resp.settings) {
        currentSettings = resp.settings;
        renderState();
      }
    });
  }

  el<HTMLSelectElement>('maskStyleSelect').addEventListener('change', (ev) => {
    const maskStyle = (ev.target as HTMLSelectElement).value as MaskStyle;
    void sendUpdate({ ...currentSettings, maskStyle });
  });

  el<HTMLSelectElement>('sensitivitySelect').addEventListener('change', (ev) => {
    const sensitivity = (ev.target as HTMLSelectElement).value as SensitivityLevel;
    void sendUpdate({ ...currentSettings, sensitivity });
  });

  el<HTMLInputElement>('blurRange').addEventListener('input', (ev) => {
    const blurIntensityPx = Number((ev.target as HTMLInputElement).value);
    el('blurValue').textContent = `${blurIntensityPx}px`;
    void sendUpdate({ ...currentSettings, blurIntensityPx });
  });

  el<HTMLInputElement>('autoMuteCheck').addEventListener('change', (ev) => {
    void sendUpdate({ ...currentSettings, autoMuteOnBlur: (ev.target as HTMLInputElement).checked });
  });

  el<HTMLInputElement>('zeroFlashCheck').addEventListener('change', (ev) => {
    void sendUpdate({ ...currentSettings, zeroFlashShield: (ev.target as HTMLInputElement).checked });
  });

  el<HTMLButtonElement>('lockBtn').addEventListener('click', async () => {
    if (isTimeLocked(currentSettings.timeLock)) {
      const resp = (await chrome.runtime.sendMessage({
        type: 'GB_START_COOLDOWN',
      } satisfies RuntimeRequest)) as UpdateSettingsResponse;
      if (resp.settings) currentSettings = resp.settings;
    } else {
      const resp = (await chrome.runtime.sendMessage({
        type: 'GB_ACTIVATE_TIMELOCK',
        durationMs: 60 * 60 * 1000,
      } satisfies RuntimeRequest)) as UpdateSettingsResponse;
      if (resp.settings) currentSettings = resp.settings;
    }
    renderState();
  });

  el<HTMLButtonElement>('pinActionBtn').addEventListener('click', async () => {
    const pin = el<HTMLInputElement>('pinInput').value.trim();
    if (pin.length < 4) return;
    const type = currentSettings.timeLock.pinHashHex ? 'GB_UNLOCK_PIN' : 'GB_SET_PIN';
    const resp = (await chrome.runtime.sendMessage({
      type,
      pin,
    } satisfies RuntimeRequest)) as UpdateSettingsResponse;
    if (resp.settings) {
      currentSettings = resp.settings;
      el<HTMLInputElement>('pinInput').value = '';
      renderState();
    }
  });

  el<HTMLButtonElement>('openOptionsBtn').addEventListener('click', () => {
    void chrome.runtime.openOptionsPage();
  });
}

void init();
