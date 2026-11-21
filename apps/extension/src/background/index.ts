import {
  applyProfilePreset,
  derivePinHash,
  evaluatePolicy,
  isHostnameWhitelisted,
  isTimeLocked,
  isWeakeningChange,
  parseAndValidateImport,
  startUnlockCooldown,
  verifyPartnerPin,
  type ExtensionSettings,
  type RawDetectionOutput,
  type TabTelemetry,
} from '@ghadhul-bashar/core';
import { InferenceHost } from '../offscreen/inference-host.js';
import type {
  AnalyzeResponse,
  ContentPushMessage,
  FrameAllowedResponse,
  RuntimeRequest,
  UpdateSettingsResponse,
} from '../shared/messages.js';
import { loadSettings, normalizeHostname, saveSettings } from '../shared/storage.js';

let offscreenCreating: Promise<void> | null = null;
let directHost: InferenceHost | null = null;
const tabTelemetry = new Map<number, TabTelemetry>();

function supportsOffscreen(): boolean {
  return typeof chrome.offscreen !== 'undefined' && typeof chrome.offscreen.createDocument === 'function';
}

async function ensureOffscreenReady(): Promise<void> {
  if (!supportsOffscreen()) {
    if (!directHost) {
      directHost = new InferenceHost();
      await directHost.ensureEngine();
    }
    return;
  }

  const offscreenApi = chrome.offscreen as typeof chrome.offscreen & {
    hasDocument?: () => Promise<boolean>;
  };
  if (offscreenApi.hasDocument) {
    const exists = await offscreenApi.hasDocument();
    if (exists) return;
  }

  if (!offscreenCreating) {
    offscreenCreating = chrome.offscreen
      .createDocument({
        url: chrome.runtime.getURL('offscreen.html'),
        reasons: [chrome.offscreen.Reason.DOM_PARSER],
        justification: 'Run local quantized ONNX gaze-protection vision inference.',
      })
      .catch((err) => {
        // Ignore duplicate creation race if document already existed
        if (!String(err).includes('single offscreen')) {
          throw err;
        }
      })
      .finally(() => {
        offscreenCreating = null;
      });
  }
  await offscreenCreating;
}

async function runInferenceUrl(
  url: string,
  priority: number
): Promise<{ raw: RawDetectionOutput; fromCache: boolean }> {
  await ensureOffscreenReady();
  if (directHost) {
    return directHost.analyzeUrl(url, priority);
  }
  const resp = (await chrome.runtime.sendMessage({
    type: 'GB_OFFSCREEN_ANALYZE_URL',
    url,
    priority,
  } satisfies RuntimeRequest)) as AnalyzeResponse;
  if (!resp?.ok || !resp.raw) {
    throw new Error(resp?.error ?? 'Offscreen URL inference failed');
  }
  return { raw: resp.raw, fromCache: Boolean(resp.fromCache) };
}

async function runInferenceFrame(
  dataUrl: string,
  cacheKey: string | undefined,
  isVideoKeyframe: boolean,
  priority: number
): Promise<{ raw: RawDetectionOutput; fromCache: boolean }> {
  await ensureOffscreenReady();
  if (directHost) {
    return directHost.analyzeDataUrl(dataUrl, cacheKey, isVideoKeyframe, priority);
  }
  const resp = (await chrome.runtime.sendMessage({
    type: 'GB_OFFSCREEN_ANALYZE_FRAME',
    dataUrl,
    cacheKey,
    isVideoKeyframe,
    priority,
  } satisfies RuntimeRequest)) as AnalyzeResponse;
  if (!resp?.ok || !resp.raw) {
    throw new Error(resp?.error ?? 'Offscreen frame inference failed');
  }
  return { raw: resp.raw, fromCache: Boolean(resp.fromCache) };
}

function getOrCreateTelemetry(tabId: number): TabTelemetry {
  let stats = tabTelemetry.get(tabId);
  if (!stats) {
    stats = {
      checkedCount: 0,
      maskedCount: 0,
      cacheHitCount: 0,
      avgLatencyMs: 0,
      backend: 'idle',
    };
    tabTelemetry.set(tabId, stats);
  }
  return stats;
}

function updateTabTelemetry(
  tabId: number | undefined,
  masked: boolean,
  fromCache: boolean,
  latencyMs: number,
  backend: TabTelemetry['backend']
): void {
  if (tabId === undefined || tabId < 0) return;
  const stats = getOrCreateTelemetry(tabId);
  stats.checkedCount += 1;
  if (masked) stats.maskedCount += 1;
  if (fromCache) stats.cacheHitCount += 1;
  stats.backend = backend;
  if (latencyMs > 0) {
    const n = stats.checkedCount;
    stats.avgLatencyMs = Math.round(((stats.avgLatencyMs * (n - 1) + latencyMs) / n) * 10) / 10;
  }

  const badge = stats.maskedCount > 0 ? String(Math.min(999, stats.maskedCount)) : '';
  void chrome.action.setBadgeText({ tabId, text: badge });
  void chrome.action.setBadgeBackgroundColor({ tabId, color: '#059669' });
}

async function broadcastSettings(settings: ExtensionSettings): Promise<void> {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id !== undefined) {
      chrome.tabs
        .sendMessage(tab.id, {
          type: 'GB_SETTINGS_CHANGED',
          settings,
        } satisfies ContentPushMessage)
        .catch(() => {});
    }
  }
}

async function commitSettingsChange(
  next: ExtensionSettings,
  pin?: string
): Promise<UpdateSettingsResponse> {
  const current = await loadSettings();
  const weakening = isWeakeningChange(current, next);
  if (weakening && isTimeLocked(current.timeLock)) {
    if (current.timeLock.pinHashHex) {
      const valid = pin ? await verifyPartnerPin(pin, current.timeLock) : false;
      if (!valid) return { ok: false, settings: current, error: 'INVALID_PIN' };
    } else {
      return { ok: false, settings: current, error: 'LOCKED' };
    }
  }

  await saveSettings(next);
  await broadcastSettings(next);
  return { ok: true, settings: next };
}

function setupContextMenus(): void {
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: 'gb-manual-mask',
        title: 'Ghadhul Bashar: Blur media ini',
        contexts: ['image', 'video'],
      });
      chrome.contextMenus.create({
        id: 'gb-manual-reveal',
        title: 'Ghadhul Bashar: Tampilkan media ini',
        contexts: ['image', 'video'],
      });
    });
  } catch {
    // Ignore context menu initialization races
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  void loadSettings().then((settings) => {
    if (details.reason === 'install' && !settings.onboardingCompleted) {
      void chrome.tabs.create({ url: chrome.runtime.getURL('ui/onboarding.html') });
    }
  });
  setupContextMenus();
  void ensureOffscreenReady().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  setupContextMenus();
  void ensureOffscreenReady().catch(() => {});
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (tab?.id === undefined) return;
  const tabId = tab.id;
  void loadSettings().then((settings) => {
    if (info.menuItemId === 'gb-manual-reveal' && isTimeLocked(settings.timeLock)) {
      return;
    }
    const mode = info.menuItemId === 'gb-manual-mask' ? 'mask' : 'reveal';
    chrome.tabs
      .sendMessage(
        tabId,
        { type: 'GB_MANUAL_OVERRIDE', mode } satisfies ContentPushMessage,
        { frameId: info.frameId }
      )
      .catch(() => {});
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabTelemetry.delete(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading' && changeInfo.url) {
    tabTelemetry.delete(tabId);
    void chrome.action.setBadgeText({ tabId, text: '' });
  }
});

chrome.runtime.onMessage.addListener(
  (message: RuntimeRequest, sender, sendResponse) => {
    if (
      message.type === 'GB_OFFSCREEN_ANALYZE_URL' ||
      message.type === 'GB_OFFSCREEN_ANALYZE_FRAME' ||
      message.type === 'GB_OFFSCREEN_CLEAR_CACHE' ||
      message.type === 'GB_OFFSCREEN_BENCHMARK_ANALYZE' ||
      message.type === 'GB_GET_ENGINE_STATUS'
    ) {
      // Handled exclusively by the offscreen document on Chrome; only answer status on Firefox.
      if (!supportsOffscreen() && message.type === 'GB_GET_ENGINE_STATUS') {
        sendResponse(directHost ? directHost.getStatus() : { ready: false, backend: 'idle' });
        return false;
      }
      return false;
    }

    if (message.type === 'GB_PING') {
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === 'GB_CLEAR_CACHE') {
      void ensureOffscreenReady()
        .then(async () => {
          if (directHost) {
            await directHost.clearCache();
            sendResponse({ ok: true });
            return;
          }
          const resp = await chrome.runtime.sendMessage({
            type: 'GB_OFFSCREEN_CLEAR_CACHE',
          } satisfies RuntimeRequest);
          sendResponse(resp ?? { ok: true });
        })
        .catch(() => sendResponse({ ok: false }));
      return true;
    }

    if (message.type === 'GB_BENCHMARK_ANALYZE') {
      void ensureOffscreenReady()
        .then(async () => {
          if (directHost) {
            const raw = await directHost.benchmarkDataUrl(message.dataUrl, message.cascadeMode);
            sendResponse({ ok: true, raw } satisfies AnalyzeResponse);
            return;
          }
          const resp = (await chrome.runtime.sendMessage({
            type: 'GB_OFFSCREEN_BENCHMARK_ANALYZE',
            dataUrl: message.dataUrl,
            cascadeMode: message.cascadeMode,
          } satisfies RuntimeRequest)) as AnalyzeResponse;
          sendResponse(resp);
        })
        .catch((err) =>
          sendResponse({
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          } satisfies AnalyzeResponse)
        );
      return true;
    }

    if (message.type === 'GB_GET_SETTINGS') {
      void loadSettings().then((settings) => sendResponse(settings));
      return true;
    }

    if (message.type === 'GB_CHECK_FRAME') {
      void loadSettings().then((settings) => {
        const topUrl = sender.tab?.url || message.frameUrl;
        const hostname = normalizeHostname(topUrl);
        const whitelisted = isHostnameWhitelisted(hostname, settings.whitelist);
        sendResponse({
          enabled: settings.enabled && !whitelisted,
          whitelisted,
          hostname,
          settings,
        } satisfies FrameAllowedResponse);
      });
      return true;
    }

    if (message.type === 'GB_UPDATE_SETTINGS') {
      void commitSettingsChange(message.next, message.pin).then(sendResponse);
      return true;
    }

    if (message.type === 'GB_IMPORT_SETTINGS') {
      void loadSettings().then(async (current) => {
        let next: ExtensionSettings;
        try {
          next = parseAndValidateImport(message.jsonText, current);
        } catch {
          sendResponse({
            ok: false,
            settings: current,
            error: 'INVALID_CONFIG',
          } satisfies UpdateSettingsResponse);
          return;
        }
        const res = await commitSettingsChange(next, message.pin);
        sendResponse(res);
      });
      return true;
    }

    if (message.type === 'GB_APPLY_PROFILE') {
      void loadSettings().then(async (current) => {
        const next = applyProfilePreset(current, message.profile);
        if (message.completeOnboarding) next.onboardingCompleted = true;
        const res = await commitSettingsChange(next, message.pin);
        sendResponse(res);
      });
      return true;
    }

    if (message.type === 'GB_TOGGLE_SITE') {
      void loadSettings().then(async (current) => {
        const host = normalizeHostname(message.hostname);
        const covered = isHostnameWhitelisted(host, current.whitelist);
        const whitelist = covered
          ? current.whitelist.filter((entry) => {
              const clean = normalizeHostname(entry);
              return !(host === clean || host.endsWith(`.${clean}`));
            })
          : [...current.whitelist, host];
        const next: ExtensionSettings = { ...current, whitelist };
        const res = await commitSettingsChange(next, message.pin);
        sendResponse(res);
      });
      return true;
    }

    if (message.type === 'GB_START_COOLDOWN') {
      void loadSettings().then(async (current) => {
        const next: ExtensionSettings = {
          ...current,
          timeLock: startUnlockCooldown(current.timeLock),
        };
        await saveSettings(next);
        sendResponse({ ok: true, settings: next } satisfies UpdateSettingsResponse);
      });
      return true;
    }

    if (message.type === 'GB_ACTIVATE_TIMELOCK') {
      void loadSettings().then(async (current) => {
        const duration = Math.max(60_000, message.durationMs);
        const next: ExtensionSettings = {
          ...current,
          timeLock: {
            ...current.timeLock,
            cooldownDurationMs: duration,
            lockedUntilMs: Date.now() + duration,
            pendingUnlockAtMs: 0,
          },
        };
        await saveSettings(next);
        sendResponse({ ok: true, settings: next } satisfies UpdateSettingsResponse);
      });
      return true;
    }

    if (message.type === 'GB_SET_PIN') {
      void loadSettings().then(async (current) => {
        if (!message.pin || message.pin.length < 4) {
          sendResponse({ ok: false, settings: current, error: 'INVALID_PIN' } satisfies UpdateSettingsResponse);
          return;
        }
        const { hashHex, saltHex } = await derivePinHash(message.pin);
        const next: ExtensionSettings = {
          ...current,
          timeLock: {
            ...current.timeLock,
            pinHashHex: hashHex,
            pinSaltHex: saltHex,
            lockedUntilMs: Math.max(current.timeLock.lockedUntilMs, Date.now() + 86_400_000),
          },
        };
        await saveSettings(next);
        sendResponse({ ok: true, settings: next } satisfies UpdateSettingsResponse);
      });
      return true;
    }

    if (message.type === 'GB_UNLOCK_PIN') {
      void loadSettings().then(async (current) => {
        const ok = await verifyPartnerPin(message.pin, current.timeLock);
        if (!ok) {
          sendResponse({ ok: false, settings: current, error: 'INVALID_PIN' } satisfies UpdateSettingsResponse);
          return;
        }
        const next: ExtensionSettings = {
          ...current,
          timeLock: {
            ...current.timeLock,
            lockedUntilMs: 0,
            pendingUnlockAtMs: 0,
            pinHashHex: null,
            pinSaltHex: null,
          },
        };
        await saveSettings(next);
        sendResponse({ ok: true, settings: next } satisfies UpdateSettingsResponse);
      });
      return true;
    }

    if (message.type === 'GB_ANALYZE_URL') {
      void loadSettings()
        .then(async (settings) => {
          const { raw, fromCache } = await runInferenceUrl(message.url, message.priority ?? 10);
          const verdict = evaluatePolicy(raw, settings, fromCache);
          updateTabTelemetry(
            sender.tab?.id,
            verdict.action !== 'clear',
            verdict.fromCache,
            verdict.latencyMs,
            verdict.backend
          );
          sendResponse({ ok: true, verdict } satisfies AnalyzeResponse);
        })
        .catch((err) => {
          sendResponse({
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          } satisfies AnalyzeResponse);
        });
      return true;
    }

    if (message.type === 'GB_ANALYZE_FRAME') {
      void loadSettings()
        .then(async (settings) => {
          const { raw, fromCache } = await runInferenceFrame(
            message.dataUrl,
            message.cacheKey,
            Boolean(message.isVideoKeyframe),
            message.priority ?? 8
          );
          const verdict = evaluatePolicy(raw, settings, fromCache);
          if (!message.isVideoKeyframe) {
            updateTabTelemetry(
              sender.tab?.id,
              verdict.action !== 'clear',
              verdict.fromCache,
              verdict.latencyMs,
              verdict.backend
            );
          }
          sendResponse({ ok: true, verdict } satisfies AnalyzeResponse);
        })
        .catch((err) => {
          sendResponse({
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          } satisfies AnalyzeResponse);
        });
      return true;
    }

    if (message.type === 'GB_CAPTURE_AND_ANALYZE_RECT') {
      const tab = sender.tab;
      if (!tab || tab.windowId === undefined || !tab.active) {
        sendResponse({ ok: false, error: 'Tab not active for capture' } satisfies AnalyzeResponse);
        return false;
      }
      chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 65 }, (tabDataUrl) => {
        if (chrome.runtime.lastError || !tabDataUrl) {
          sendResponse({
            ok: false,
            error: chrome.runtime.lastError?.message ?? 'captureVisibleTab unavailable',
          } satisfies AnalyzeResponse);
          return;
        }
        void loadSettings().then(async (settings) => {
          try {
            // Crop visible rect inside offscreen/worker by passing dataUrl
            const res = await fetch(tabDataUrl);
            const blob = await res.blob();
            const bmp = await createImageBitmap(blob);
            const sx = Math.max(0, Math.round(message.rect.x * message.dpr));
            const sy = Math.max(0, Math.round(message.rect.y * message.dpr));
            const sw = Math.min(bmp.width - sx, Math.max(16, Math.round(message.rect.w * message.dpr)));
            const sh = Math.min(bmp.height - sy, Math.max(16, Math.round(message.rect.h * message.dpr)));
            const canvas = new OffscreenCanvas(Math.min(320, sw), Math.min(320, sh));
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(bmp, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
            bmp.close();
            const croppedBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.72 });
            const buf = new Uint8Array(await croppedBlob.arrayBuffer());
            let bin = '';
            for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]!);
            const cropDataUrl = `data:image/jpeg;base64,${btoa(bin)}`;
            const { raw, fromCache } = await runInferenceFrame(cropDataUrl, undefined, true, 9);
            const verdict = evaluatePolicy(raw, settings, fromCache);
            sendResponse({ ok: true, verdict } satisfies AnalyzeResponse);
          } catch (err) {
            sendResponse({
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            } satisfies AnalyzeResponse);
          }
        });
      });
      return true;
    }

    if (message.type === 'GB_GET_TAB_TELEMETRY') {
      const tid = message.tabId ?? sender.tab?.id;
      const stats = tid !== undefined ? tabTelemetry.get(tid) : undefined;
      sendResponse(
        stats ?? {
          checkedCount: 0,
          maskedCount: 0,
          cacheHitCount: 0,
          avgLatencyMs: 0,
          backend: 'idle',
        }
      );
      return false;
    }

    return false;
  }
);
