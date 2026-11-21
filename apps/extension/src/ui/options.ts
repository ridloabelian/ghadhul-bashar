import {
  exportSettingsJson,
  isTimeLocked,
  normalizeDomain,
  TRANSLATIONS,
  type ExtensionSettings,
  type LocaleCode,
  type MaskStyle,
  type ProfileId,
  type SensitivityLevel,
} from '@ghadhul-bashar/core';
import type { RuntimeRequest, UpdateSettingsResponse } from '../shared/messages.js';

const PROFILE_ORDER: ProfileId[] = ['brothers', 'sisters', 'family', 'strict', 'nsfw-only'];
let currentSettings: ExtensionSettings;

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function showNotice(text: string, isError = false): void {
  const box = el('globalNotice');
  box.textContent = text;
  box.style.borderColor = isError ? 'rgba(239,68,68,0.5)' : 'rgba(16,185,129,0.5)';
  box.style.background = isError ? 'rgba(239,68,68,0.14)' : 'rgba(16,185,129,0.14)';
  box.style.color = isError ? '#fecaca' : '#a7f3d0';
  box.classList.remove('hidden');
  window.setTimeout(() => box.classList.add('hidden'), 3500);
}

function renderPreview(): void {
  const faceMask = el('previewFaceMask');
  const wholeMask = el('previewWholeMask');
  const blurPx = currentSettings.blurIntensityPx;
  const gray = currentSettings.grayscaleMask ? ' grayscale(100%)' : '';

  if (currentSettings.maskStyle === 'whole-blur') {
    faceMask.classList.add('hidden');
    wholeMask.classList.remove('hidden');
    wholeMask.style.backdropFilter = `blur(${blurPx}px)${gray}`;
    wholeMask.style.background = 'rgba(12, 18, 24, 0.35)';
    return;
  }

  wholeMask.classList.add('hidden');
  faceMask.classList.remove('hidden');
  faceMask.classList.toggle('gb-pixelate', currentSettings.maskStyle === 'surgical-pixelate');

  if (currentSettings.maskStyle === 'surgical-ambient') {
    faceMask.style.backdropFilter = 'none';
    faceMask.style.background = 'rgb(28, 42, 46)';
  } else if (currentSettings.maskStyle === 'surgical-pixelate') {
    faceMask.style.backdropFilter = `blur(${Math.max(10, Math.round(blurPx * 0.55))}px)${gray}`;
    faceMask.style.backgroundColor = 'rgba(15, 23, 42, 0.42)';
  } else {
    faceMask.style.backdropFilter = `blur(${blurPx}px)${gray}`;
    faceMask.style.background = 'rgba(12, 18, 24, 0.32)';
  }
}

function renderWhitelist(): void {
  const dict = TRANSLATIONS[currentSettings.locale];
  const container = el('whitelistList');
  container.replaceChildren();
  if (currentSettings.whitelist.length === 0) {
    const empty = document.createElement('span');
    empty.style.fontSize = '12px';
    empty.style.color = 'var(--muted)';
    empty.textContent = dict.emptyWhitelist;
    container.appendChild(empty);
    return;
  }

  for (const domain of currentSettings.whitelist) {
    const chip = document.createElement('div');
    chip.className = 'whitelist-chip';
    const label = document.createElement('span');
    label.textContent = domain;
    const btn = document.createElement('button');
    btn.className = 'btn btn-danger btn-sm';
    btn.textContent = dict.removeBtn;
    btn.addEventListener('click', () => {
      const next: ExtensionSettings = {
        ...currentSettings,
        whitelist: currentSettings.whitelist.filter((d) => d !== domain),
      };
      void commitUpdate(next);
    });
    chip.append(label, btn);
    container.appendChild(chip);
  }
}

function renderTranslations(locale: LocaleCode): void {
  const dict = TRANSLATIONS[locale];
  document.documentElement.lang = locale;
  document.documentElement.dir = dict.isRtl ? 'rtl' : 'ltr';

  el('optionsTitle').textContent = dict.optionsTitle;
  el('arabicTitle').textContent = dict.arabicTitle;
  el('optionsSubtitle').textContent = dict.optionsSubtitle;
  el('statusPill').textContent = currentSettings.enabled ? dict.statusActive : dict.statusPaused;
  el('sectionProfilesTitle').textContent = dict.sectionProfilesTitle;
  el('sectionVisualTitle').textContent = dict.sectionVisualTitle;
  el('sectionWhitelistTitle').textContent = dict.sectionWhitelistTitle;
  el('sectionSelfControlTitle').textContent = dict.sectionSelfControlTitle;
  el('sectionBackupTitle').textContent = dict.sectionBackupTitle;

  el('ruleFemaleFaceLabel').textContent = dict.ruleFemaleFace;
  el('ruleMaleFaceLabel').textContent = dict.ruleMaleFace;
  el('ruleAwrahBodyLabel').textContent = dict.ruleAwrahBody;
  el('ruleExposedNudityLabel').textContent = dict.ruleExposedNudity;
  el('ruleAutoEscalateLabel').textContent = dict.ruleAutoEscalateNsfw;
  el('ruleChildAgeLabel').textContent = dict.ruleChildAgeLabel;

  el('maskStyleLabel').textContent = dict.maskStyleLabel;
  el('sensitivityLabel').textContent = dict.sensitivityLabel;
  el('blurStrengthLabel').textContent = dict.blurStrengthLabel;
  el('grayscaleLabel').textContent = dict.grayscaleLabel;
  el('zeroFlashLabel').textContent = dict.zeroFlashLabel;
  el('failClosedLabel').textContent = dict.failClosedLabel;
  el('autoMuteLabel').textContent = dict.autoMuteLabel;
  el('altPeekLabel').textContent = dict.altPeekLabel;
  el('previewTitle').textContent = dict.previewTitle;
  el('previewSafeText').textContent = dict.previewSafeText;

  el<HTMLInputElement>('whitelistInput').placeholder = dict.addDomainPlaceholder;
  el('addWhitelistBtn').textContent = dict.addBtn;
  el('lockDurationLabel').textContent = dict.lockDurationLabel;
  el<HTMLInputElement>('pinInput').placeholder = dict.pinPlaceholder;
  el('exportBtn').textContent = dict.exportBtn;
  el('importBtnLabel').textContent = dict.importBtn;
  el('clearCacheBtn').textContent = dict.clearCacheBtn;
  el('backupHint').textContent = dict.backupHint;
  el('diagBackendLabel').textContent = dict.diagBackendLabel;
  el('diagModelsLabel').textContent = dict.diagModelsLabel;

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

function renderProfiles(): void {
  const dict = TRANSLATIONS[currentSettings.locale];
  const grid = el('profileCards');
  grid.replaceChildren();
  for (const pid of PROFILE_ORDER) {
    const btn = document.createElement('button');
    btn.className = `profile-card${pid === currentSettings.profile ? ' active' : ''}`;
    btn.dataset.profile = pid;
    const h3 = document.createElement('h3');
    h3.textContent = dict.profiles[pid].title;
    const p = document.createElement('p');
    p.textContent = dict.profiles[pid].desc;
    btn.append(h3, p);
    btn.addEventListener('click', () => void applyProfile(pid));
    grid.appendChild(btn);
  }
}

function renderState(): void {
  renderTranslations(currentSettings.locale);
  renderProfiles();

  el<HTMLSelectElement>('localeSelect').value = currentSettings.locale;
  el<HTMLInputElement>('ruleFemaleFace').checked = currentSettings.overrides.blurFemaleFace;
  el<HTMLInputElement>('ruleMaleFace').checked = currentSettings.overrides.blurMaleFace;
  el<HTMLInputElement>('ruleAwrahBody').checked = currentSettings.overrides.blurAwrahBody;
  el<HTMLInputElement>('ruleExposedNudity').checked = currentSettings.overrides.blurExposedNudity;
  el<HTMLInputElement>('ruleAutoEscalateNsfw').checked = currentSettings.overrides.autoEscalateNsfw;
  el<HTMLInputElement>('childAgeRange').value = String(currentSettings.overrides.exemptChildrenUnderAge);
  el('childAgeValue').textContent = `< ${currentSettings.overrides.exemptChildrenUnderAge}`;

  el<HTMLSelectElement>('maskStyleSelect').value = currentSettings.maskStyle;
  el<HTMLSelectElement>('sensitivitySelect').value = currentSettings.sensitivity;
  el<HTMLInputElement>('blurRange').value = String(currentSettings.blurIntensityPx);
  el('blurValue').textContent = `${currentSettings.blurIntensityPx}px`;
  el<HTMLInputElement>('grayscaleCheck').checked = currentSettings.grayscaleMask;
  el<HTMLInputElement>('zeroFlashCheck').checked = currentSettings.zeroFlashShield;
  el<HTMLInputElement>('failClosedCheck').checked = currentSettings.failClosedOnError;
  el<HTMLInputElement>('autoMuteCheck').checked = currentSettings.autoMuteOnBlur;
  el<HTMLInputElement>('altPeekCheck').checked = currentSettings.altHoverPeek;

  renderPreview();
  renderWhitelist();

  const dict = TRANSLATIONS[currentSettings.locale];
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

async function commitUpdate(next: ExtensionSettings): Promise<void> {
  const pin = el<HTMLInputElement>('pinInput').value.trim() || undefined;
  const resp = (await chrome.runtime.sendMessage({
    type: 'GB_UPDATE_SETTINGS',
    next,
    pin,
  } satisfies RuntimeRequest)) as UpdateSettingsResponse;

  if (!resp.ok && resp.settings) {
    currentSettings = resp.settings;
    renderState();
    showNotice(TRANSLATIONS[currentSettings.locale].lockedWarning, true);
    return;
  }
  if (resp.settings) {
    currentSettings = resp.settings;
    renderState();
    showNotice(TRANSLATIONS[currentSettings.locale].msgSaved);
  }
}

async function applyProfile(profile: ProfileId): Promise<void> {
  const pin = el<HTMLInputElement>('pinInput').value.trim() || undefined;
  const resp = (await chrome.runtime.sendMessage({
    type: 'GB_APPLY_PROFILE',
    profile,
    pin,
  } satisfies RuntimeRequest)) as UpdateSettingsResponse;

  if (!resp.ok && resp.settings) {
    currentSettings = resp.settings;
    renderState();
    showNotice(TRANSLATIONS[currentSettings.locale].lockedWarning, true);
    return;
  }
  if (resp.settings) {
    currentSettings = resp.settings;
    renderState();
    showNotice(TRANSLATIONS[currentSettings.locale].msgSaved);
  }
}

async function refreshDiagnostics(): Promise<void> {
  const status = (await chrome.runtime.sendMessage({
    type: 'GB_GET_ENGINE_STATUS',
  } satisfies RuntimeRequest)) as { ready: boolean; backend: 'webgpu' | 'wasm' | 'idle' } | undefined;
  const backendLabel =
    status?.backend === 'webgpu' ? 'WebGPU' : status?.backend === 'wasm' ? 'WASM SIMD (XNNPACK)' : 'WASM (Standby)';
  el('diagBackendValue').textContent = backendLabel;
}

async function init(): Promise<void> {
  currentSettings = (await chrome.runtime.sendMessage({
    type: 'GB_GET_SETTINGS',
  } satisfies RuntimeRequest)) as ExtensionSettings;
  renderState();
  void refreshDiagnostics();

  el<HTMLSelectElement>('localeSelect').addEventListener('change', (ev) => {
    const locale = (ev.target as HTMLSelectElement).value as LocaleCode;
    void commitUpdate({ ...currentSettings, locale });
  });

  const bindRuleCheck = (
    id: string,
    key: 'blurFemaleFace' | 'blurMaleFace' | 'blurAwrahBody' | 'blurExposedNudity' | 'autoEscalateNsfw'
  ) => {
    el<HTMLInputElement>(id).addEventListener('change', (ev) => {
      const checked = (ev.target as HTMLInputElement).checked;
      void commitUpdate({
        ...currentSettings,
        overrides: { ...currentSettings.overrides, [key]: checked },
      });
    });
  };
  bindRuleCheck('ruleFemaleFace', 'blurFemaleFace');
  bindRuleCheck('ruleMaleFace', 'blurMaleFace');
  bindRuleCheck('ruleAwrahBody', 'blurAwrahBody');
  bindRuleCheck('ruleExposedNudity', 'blurExposedNudity');
  bindRuleCheck('ruleAutoEscalateNsfw', 'autoEscalateNsfw');

  el<HTMLInputElement>('childAgeRange').addEventListener('input', (ev) => {
    const age = Number((ev.target as HTMLInputElement).value);
    el('childAgeValue').textContent = `< ${age}`;
    void commitUpdate({
      ...currentSettings,
      overrides: { ...currentSettings.overrides, exemptChildrenUnderAge: age },
    });
  });

  el<HTMLSelectElement>('maskStyleSelect').addEventListener('change', (ev) => {
    void commitUpdate({ ...currentSettings, maskStyle: (ev.target as HTMLSelectElement).value as MaskStyle });
  });
  el<HTMLSelectElement>('sensitivitySelect').addEventListener('change', (ev) => {
    void commitUpdate({
      ...currentSettings,
      sensitivity: (ev.target as HTMLSelectElement).value as SensitivityLevel,
    });
  });
  el<HTMLInputElement>('blurRange').addEventListener('input', (ev) => {
    const blurIntensityPx = Number((ev.target as HTMLInputElement).value);
    el('blurValue').textContent = `${blurIntensityPx}px`;
    void commitUpdate({ ...currentSettings, blurIntensityPx });
  });
  el<HTMLInputElement>('grayscaleCheck').addEventListener('change', (ev) => {
    void commitUpdate({ ...currentSettings, grayscaleMask: (ev.target as HTMLInputElement).checked });
  });
  el<HTMLInputElement>('zeroFlashCheck').addEventListener('change', (ev) => {
    void commitUpdate({ ...currentSettings, zeroFlashShield: (ev.target as HTMLInputElement).checked });
  });
  el<HTMLInputElement>('failClosedCheck').addEventListener('change', (ev) => {
    void commitUpdate({ ...currentSettings, failClosedOnError: (ev.target as HTMLInputElement).checked });
  });
  el<HTMLInputElement>('autoMuteCheck').addEventListener('change', (ev) => {
    void commitUpdate({ ...currentSettings, autoMuteOnBlur: (ev.target as HTMLInputElement).checked });
  });
  el<HTMLInputElement>('altPeekCheck').addEventListener('change', (ev) => {
    void commitUpdate({ ...currentSettings, altHoverPeek: (ev.target as HTMLInputElement).checked });
  });

  el<HTMLButtonElement>('addWhitelistBtn').addEventListener('click', () => {
    const input = el<HTMLInputElement>('whitelistInput');
    const domain = normalizeDomain(input.value);
    if (!domain || !/^[a-z0-9.-]+$/.test(domain)) {
      showNotice(TRANSLATIONS[currentSettings.locale].msgInvalidDomain, true);
      return;
    }
    if (currentSettings.whitelist.includes(domain)) {
      input.value = '';
      return;
    }
    input.value = '';
    void commitUpdate({
      ...currentSettings,
      whitelist: [...currentSettings.whitelist, domain],
    });
  });

  el<HTMLButtonElement>('lockBtn').addEventListener('click', async () => {
    if (isTimeLocked(currentSettings.timeLock)) {
      const resp = (await chrome.runtime.sendMessage({
        type: 'GB_START_COOLDOWN',
      } satisfies RuntimeRequest)) as UpdateSettingsResponse;
      if (resp.settings) currentSettings = resp.settings;
    } else {
      const durationMs = Number(el<HTMLSelectElement>('lockDurationSelect').value) || 3_600_000;
      const resp = (await chrome.runtime.sendMessage({
        type: 'GB_ACTIVATE_TIMELOCK',
        durationMs,
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
    if (!resp.ok && resp.settings) {
      currentSettings = resp.settings;
      renderState();
      showNotice(TRANSLATIONS[currentSettings.locale].lockedWarning, true);
      return;
    }
    if (resp.settings) {
      currentSettings = resp.settings;
      el<HTMLInputElement>('pinInput').value = '';
      renderState();
      showNotice(TRANSLATIONS[currentSettings.locale].msgSaved);
    }
  });

  el<HTMLButtonElement>('exportBtn').addEventListener('click', () => {
    const json = exportSettingsJson(currentSettings);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ghadhul-bashar-config.json';
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  el<HTMLInputElement>('importFileInput').addEventListener('change', async (ev) => {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const jsonText = await file.text();
    input.value = '';
    const pin = el<HTMLInputElement>('pinInput').value.trim() || undefined;
    const resp = (await chrome.runtime.sendMessage({
      type: 'GB_IMPORT_SETTINGS',
      jsonText,
      pin,
    } satisfies RuntimeRequest)) as UpdateSettingsResponse;
    if (!resp.ok) {
      if (resp.settings) {
        currentSettings = resp.settings;
        renderState();
      }
      showNotice(TRANSLATIONS[currentSettings.locale].msgImportFailed, true);
      return;
    }
    if (resp.settings) {
      currentSettings = resp.settings;
      renderState();
      showNotice(TRANSLATIONS[currentSettings.locale].msgImported);
    }
  });

  el<HTMLButtonElement>('clearCacheBtn').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'GB_CLEAR_CACHE' } satisfies RuntimeRequest);
    showNotice(TRANSLATIONS[currentSettings.locale].msgCacheCleared);
  });
}

void init();
