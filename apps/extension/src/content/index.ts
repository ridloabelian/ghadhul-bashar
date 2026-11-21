import {
  createDefaultSettings,
  isHostnameWhitelisted,
  type ExtensionSettings,
} from '@ghadhul-bashar/core';
import type { ContentPushMessage, FrameAllowedResponse, RuntimeRequest } from '../shared/messages.js';
import { MediaScanner } from './scanner.js';
import { SurgicalOverlayManager } from './surgical-overlay.js';
import { VideoGuardManager } from './video-guard.js';

let settings: ExtensionSettings = createDefaultSettings();
const overlay = new SurgicalOverlayManager(settings);
const videoGuard = new VideoGuardManager(overlay, settings);
const scanner = new MediaScanner(overlay, videoGuard, settings);

let frameActive = true;
let frameChecked = false;
let currentHostname = '';

// Start observing immediately at document_start for 0ms deterministic Zero-Flash protection.
if (document.documentElement) {
  scanner.observeRoot(document.documentElement);
}

function applyFrameState(nextSettings: ExtensionSettings, active: boolean): void {
  settings = nextSettings;
  frameActive = active;
  if (!active) {
    scanner.stop();
    overlay.clearAll();
    overlay.updateSettings({ ...nextSettings, enabled: false });
    videoGuard.updateSettings({ ...nextSettings, enabled: false });
    return;
  }

  overlay.updateSettings(nextSettings);
  videoGuard.updateSettings(nextSettings);
  if (document.documentElement) {
    scanner.observeRoot(document.documentElement);
  }
  scanner.activateWithSettings(nextSettings);
}

chrome.runtime.sendMessage(
  { type: 'GB_CHECK_FRAME', frameUrl: window.location.href } satisfies RuntimeRequest,
  (resp: FrameAllowedResponse | undefined) => {
    frameChecked = true;
    if (chrome.runtime.lastError || !resp) {
      applyFrameState(settings, true);
      return;
    }
    currentHostname = resp.hostname;
    applyFrameState(resp.settings, resp.enabled);
  }
);

chrome.runtime.onMessage.addListener((msg: ContentPushMessage, sender) => {
  if (sender.id && sender.id !== chrome.runtime.id) return;
  if (msg.type === 'GB_SETTINGS_CHANGED') {
    const next = msg.settings;
    const whitelisted = isHostnameWhitelisted(currentHostname, next.whitelist);
    applyFrameState(next, next.enabled && !whitelisted);
  } else if (msg.type === 'GB_MANUAL_OVERRIDE' && frameActive) {
    const target = msg.selector
      ? document.querySelector(msg.selector)
      : scanner.getLastContextElement();
    if (target) {
      overlay.setManualOverride(target, msg.mode, msg.regions);
    }
  }
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (frameActive && document.documentElement) {
      scanner.observeRoot(document.documentElement);
      if (frameChecked) {
        scanner.activateWithSettings(settings);
      }
      overlay.scheduleSync();
    }
  });
}
