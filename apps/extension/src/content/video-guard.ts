import {
  computeLuma16x16,
  detectSceneCut,
  RegionTracker,
  type ExtensionSettings,
} from '@ghadhul-bashar/core';
import type { AnalyzeResponse, RuntimeRequest } from '../shared/messages.js';
import type { SurgicalOverlayManager } from './surgical-overlay.js';

interface VideoGuardRecord {
  video: HTMLVideoElement;
  tracker: RegionTracker;
  prevLuma: Uint8Array | null;
  lastKeyTimeMs: number;
  inFlight: boolean;
  taintedCors: boolean;
  isIntersecting: boolean;
  loopActive: boolean;
  posterChecked: string;
  lastFallbackCaptureMs: number;
  userMutedBeforeAutoMute: boolean | null;
  lastMaskedState: boolean;
}

const KEYFRAME_INTERVAL_MS = 180;
const TAINTED_CAPTURE_INTERVAL_MS = 550;
const SAMPLE_W = 320;
const SAMPLE_H = 180;

export class VideoGuardManager {
  private readonly records = new WeakMap<HTMLVideoElement, VideoGuardRecord>();
  private readonly activeVideos = new Set<HTMLVideoElement>();
  private readonly overlay: SurgicalOverlayManager;
  private settings: ExtensionSettings;
  private scratchCanvas: HTMLCanvasElement | null = null;
  private scratchCtx: CanvasRenderingContext2D | null = null;

  constructor(overlay: SurgicalOverlayManager, settings: ExtensionSettings) {
    this.overlay = overlay;
    this.settings = settings;

    document.addEventListener('visibilitychange', () => {
      for (const vid of this.activeVideos) {
        const rec = this.records.get(vid);
        if (rec) this.syncLoop(rec);
      }
    });
  }

  updateSettings(next: ExtensionSettings): void {
    this.settings = next;
    for (const vid of this.activeVideos) {
      const rec = this.records.get(vid);
      if (rec) {
        if (!next.enabled) {
          this.restoreAudio(rec);
        }
        this.syncLoop(rec);
      }
    }
  }

  private getScratchContext(w: number, h: number): CanvasRenderingContext2D | null {
    if (!this.scratchCanvas) {
      this.scratchCanvas = document.createElement('canvas');
      this.scratchCtx = this.scratchCanvas.getContext('2d', { willReadFrequently: true });
    }
    if (this.scratchCanvas.width !== w || this.scratchCanvas.height !== h) {
      this.scratchCanvas.width = w;
      this.scratchCanvas.height = h;
    }
    return this.scratchCtx;
  }

  register(video: HTMLVideoElement): void {
    if (this.records.has(video)) return;
    const rec: VideoGuardRecord = {
      video,
      tracker: new RegionTracker(3, 0.22),
      prevLuma: null,
      lastKeyTimeMs: 0,
      inFlight: false,
      taintedCors: false,
      isIntersecting: true,
      loopActive: false,
      posterChecked: '',
      lastFallbackCaptureMs: 0,
      userMutedBeforeAutoMute: null,
      lastMaskedState: false,
    };
    this.records.set(video, rec);
    this.activeVideos.add(video);

    if (video.poster && this.settings.enabled) {
      this.checkPoster(rec);
    } else if (this.settings.enabled && this.settings.zeroFlashShield) {
      this.overlay.setScanning(video);
    }

    video.addEventListener('play', () => this.syncLoop(rec));
    video.addEventListener('playing', () => this.syncLoop(rec));
    video.addEventListener('pause', () => this.syncLoop(rec));
    video.addEventListener('ended', () => this.syncLoop(rec));
    video.addEventListener('loadeddata', () => {
      if (video.poster && video.poster !== rec.posterChecked) {
        this.checkPoster(rec);
      }
      this.syncLoop(rec);
    });
    video.addEventListener('enterpictureinpicture', () => {
      // If active video is masked when entering PiP, keep audio guard aligned
      if (rec.lastMaskedState && this.settings.autoMuteOnBlur) {
        this.applyAutoMute(rec, true);
      }
    });

    this.syncLoop(rec);
  }

  setIntersecting(video: HTMLVideoElement, intersecting: boolean): void {
    const rec = this.records.get(video);
    if (!rec) return;
    rec.isIntersecting = intersecting;
    this.syncLoop(rec);
  }

  private checkPoster(rec: VideoGuardRecord): void {
    const posterUrl = rec.video.poster;
    if (!posterUrl || posterUrl === rec.posterChecked) return;
    rec.posterChecked = posterUrl;
    if (this.settings.zeroFlashShield) {
      this.overlay.setScanning(rec.video);
    }
    chrome.runtime.sendMessage(
      { type: 'GB_ANALYZE_URL', url: posterUrl, priority: 10 } satisfies RuntimeRequest,
      (resp: AnalyzeResponse | undefined) => {
        if (chrome.runtime.lastError || !resp?.ok || !resp.verdict) return;
        if (rec.video.paused || rec.video.currentTime === 0) {
          this.overlay.setVerdict(rec.video, resp.verdict);
        }
      }
    );
  }

  private applyAutoMute(rec: VideoGuardRecord, shouldMute: boolean): void {
    if (!this.settings.autoMuteOnBlur) return;
    if (shouldMute) {
      if (rec.userMutedBeforeAutoMute === null) {
        rec.userMutedBeforeAutoMute = rec.video.muted;
      }
      if (!rec.video.muted) {
        rec.video.muted = true;
      }
    } else {
      this.restoreAudio(rec);
    }
  }

  private restoreAudio(rec: VideoGuardRecord): void {
    if (rec.userMutedBeforeAutoMute !== null) {
      rec.video.muted = rec.userMutedBeforeAutoMute;
      rec.userMutedBeforeAutoMute = null;
    }
  }

  private syncLoop(rec: VideoGuardRecord): void {
    const shouldRun =
      this.settings.enabled &&
      rec.isIntersecting &&
      !document.hidden &&
      !rec.video.paused &&
      !rec.video.ended &&
      rec.video.isConnected;

    if (shouldRun && !rec.loopActive) {
      rec.loopActive = true;
      this.scheduleNextTick(rec);
    } else if (!shouldRun) {
      rec.loopActive = false;
      if (!this.settings.enabled) {
        this.restoreAudio(rec);
      }
    }
  }

  private scheduleNextTick(rec: VideoGuardRecord): void {
    if (!rec.loopActive) return;
    const vid = rec.video as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number;
    };
    if (typeof vid.requestVideoFrameCallback === 'function') {
      vid.requestVideoFrameCallback(() => this.onTick(rec));
    } else {
      requestAnimationFrame(() => this.onTick(rec));
    }
  }

  private onTick(rec: VideoGuardRecord): void {
    if (!rec.loopActive) return;
    const { video } = rec;
    if (
      !this.settings.enabled ||
      !rec.isIntersecting ||
      document.hidden ||
      video.paused ||
      video.ended ||
      !video.isConnected
    ) {
      rec.loopActive = false;
      return;
    }

    const now = performance.now();
    // 60 FPS smooth Kalman/velocity box interpolation between keyframes
    const predicted = rec.tracker.predict(now);
    if (predicted.length > 0) {
      this.overlay.setLiveRegions(video, predicted);
    }

    if (!rec.taintedCors) {
      this.processSameOriginFrame(rec, now);
    } else {
      this.processCrossOriginFallback(rec, now);
    }

    this.scheduleNextTick(rec);
  }

  private processSameOriginFrame(rec: VideoGuardRecord, now: number): void {
    const { video } = rec;
    if (video.readyState < 2 || video.videoWidth <= 0 || video.videoHeight <= 0) {
      return;
    }

    const scale = SAMPLE_W / Math.max(video.videoWidth, video.videoHeight);
    const w = Math.max(32, Math.round(video.videoWidth * scale));
    const h = Math.max(32, Math.round(video.videoHeight * scale));
    const ctx = this.getScratchContext(w, h);
    if (!ctx) return;

    let rgba: Uint8ClampedArray;
    try {
      ctx.drawImage(video, 0, 0, w, h);
      rgba = ctx.getImageData(0, 0, w, h).data;
    } catch {
      // Cross-origin video without CORS headers: NEVER mutate video.crossOrigin!
      // Switch cleanly to non-invasive fallback without interrupting audio/video.
      rec.taintedCors = true;
      return;
    }

    const luma = computeLuma16x16(rgba, w, h);
    const isCut = detectSceneCut(rec.prevLuma, luma);
    rec.prevLuma = luma;

    if (isCut && this.settings.zeroFlashShield) {
      rec.tracker.reset();
      this.overlay.setScanning(video);
    }

    if (rec.inFlight) return;
    if (!isCut && now - rec.lastKeyTimeMs < KEYFRAME_INTERVAL_MS) return;

    rec.inFlight = true;
    rec.lastKeyTimeMs = now;
    let dataUrl = '';
    try {
      dataUrl = this.scratchCanvas!.toDataURL('image/jpeg', 0.68);
    } catch {
      rec.inFlight = false;
      rec.taintedCors = true;
      return;
    }

    chrome.runtime.sendMessage(
      {
        type: 'GB_ANALYZE_FRAME',
        dataUrl,
        isVideoKeyframe: true,
        priority: isCut ? 12 : 7,
      } satisfies RuntimeRequest,
      (resp: AnalyzeResponse | undefined) => {
        rec.inFlight = false;
        if (chrome.runtime.lastError || !resp?.ok || !resp.verdict) return;
        this.applyVideoVerdict(rec, resp.verdict, performance.now());
      }
    );
  }

  private processCrossOriginFallback(rec: VideoGuardRecord, now: number): void {
    if (rec.inFlight || now - rec.lastFallbackCaptureMs < TAINTED_CAPTURE_INTERVAL_MS) {
      return;
    }
    const rect = rec.video.getBoundingClientRect();
    if (rect.width < 48 || rect.height < 48 || rect.bottom < 0 || rect.top > window.innerHeight) {
      return;
    }

    rec.inFlight = true;
    rec.lastFallbackCaptureMs = now;
    chrome.runtime.sendMessage(
      {
        type: 'GB_CAPTURE_AND_ANALYZE_RECT',
        rect: {
          x: Math.max(0, rect.left),
          y: Math.max(0, rect.top),
          w: Math.min(window.innerWidth - Math.max(0, rect.left), rect.width),
          h: Math.min(window.innerHeight - Math.max(0, rect.top), rect.height),
        },
        dpr: window.devicePixelRatio || 1,
      } satisfies RuntimeRequest,
      (resp: AnalyzeResponse | undefined) => {
        rec.inFlight = false;
        if (chrome.runtime.lastError || !resp?.ok || !resp.verdict) {
          // If captureVisibleTab is unavailable (e.g., background window), clear scanning shield cleanly without breaking playback
          this.overlay.setLiveRegions(rec.video, []);
          return;
        }
        this.applyVideoVerdict(rec, resp.verdict, performance.now());
      }
    );
  }

  private applyVideoVerdict(
    rec: VideoGuardRecord,
    verdict: NonNullable<AnalyzeResponse['verdict']>,
    now: number
  ): void {
    if (verdict.action === 'full-mask') {
      rec.lastMaskedState = true;
      this.applyAutoMute(rec, true);
      this.overlay.setVerdict(rec.video, verdict);
      return;
    }

    if (verdict.action === 'surgical-mask') {
      const tracked = rec.tracker.update(verdict.regions, now);
      rec.lastMaskedState = tracked.length > 0;
      this.applyAutoMute(rec, verdict.nsfwScore >= 0.4);
      this.overlay.setLiveRegions(rec.video, tracked);
      return;
    }

    const retained = rec.tracker.update([], now);
    rec.lastMaskedState = retained.length > 0;
    if (!rec.lastMaskedState) {
      this.applyAutoMute(rec, false);
    }
    this.overlay.setLiveRegions(rec.video, retained);
  }
}
