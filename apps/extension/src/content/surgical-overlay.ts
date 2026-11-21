import {
  computeMediaContentRect,
  projectRegionToElement,
  type DetectionVerdict,
  type ExtensionSettings,
  type RegionBox,
} from '@ghadhul-bashar/core';

export type OverlayPhase = 'scanning' | 'clear' | 'masked';

interface ElementOverlayEntry {
  element: Element;
  container: HTMLDivElement;
  phase: OverlayPhase;
  verdict: DetectionVerdict | null;
  liveRegions: RegionBox[] | null;
  manualOverride: 'mask' | 'reveal' | null;
  lastKey: string;
}

const SHADOW_STYLES = `
  :host {
    all: initial;
  }
  .gb-layer {
    position: fixed;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
  }
  .gb-media-wrap {
    position: fixed;
    pointer-events: none;
    overflow: hidden;
    will-change: transform, width, height;
  }
  .gb-scanning {
    position: absolute;
    inset: 0;
    border-radius: 6px;
    backdrop-filter: blur(22px) saturate(40%);
    -webkit-backdrop-filter: blur(22px) saturate(40%);
    background: linear-gradient(
      115deg,
      rgba(12, 20, 24, 0.78) 25%,
      rgba(16, 62, 48, 0.84) 50%,
      rgba(12, 20, 24, 0.78) 75%
    );
    background-size: 200% 100%;
    animation: gbShimmer 1.4s ease-in-out infinite;
  }
  .gb-mask-box {
    position: absolute;
    border-radius: 10px;
    transition: opacity 80ms linear;
  }
  .gb-full {
    inset: 0;
    border-radius: 4px;
  }
  .gb-pixelate {
    background-image:
      linear-gradient(45deg, rgba(15, 23, 42, 0.42) 25%, transparent 25%),
      linear-gradient(-45deg, rgba(15, 23, 42, 0.42) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, rgba(30, 41, 59, 0.42) 75%),
      linear-gradient(-45deg, transparent 75%, rgba(30, 41, 59, 0.42) 75%);
    background-size: 14px 14px;
    background-position: 0 0, 0 7px, 7px -7px, -7px 0;
  }
  .gb-peek {
    opacity: 0.06 !important;
  }
  @keyframes gbShimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
`;

export class SurgicalOverlayManager {
  private host: HTMLElement | null = null;
  private shadowRoot: ShadowRoot | null = null;
  private layer: HTMLDivElement | null = null;
  private entries = new WeakMap<Element, ElementOverlayEntry>();
  private tracked = new Set<Element>();
  private resizeObserver: ResizeObserver | null = null;
  private syncScheduled = false;
  private settings: ExtensionSettings;
  private altPeekPoint: { x: number; y: number } | null = null;

  constructor(settings: ExtensionSettings) {
    this.settings = settings;
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.scheduleSync());
    }
    window.addEventListener('scroll', () => this.scheduleSync(), { passive: true, capture: true });
    window.addEventListener('resize', () => this.scheduleSync(), { passive: true });
    window.addEventListener('mousemove', (ev) => this.handleMouseMove(ev), { passive: true });
    window.addEventListener('keyup', (ev) => {
      if (ev.key === 'Alt' && this.altPeekPoint) {
        this.altPeekPoint = null;
        this.scheduleSync();
      }
    });
  }

  updateSettings(next: ExtensionSettings): void {
    this.settings = next;
    for (const el of this.tracked) {
      const entry = this.entries.get(el);
      if (entry) entry.lastKey = '';
    }
    this.scheduleSync();
  }

  private handleMouseMove(ev: MouseEvent): void {
    if (!this.settings.altHoverPeek) {
      if (this.altPeekPoint) {
        this.altPeekPoint = null;
        this.scheduleSync();
      }
      return;
    }
    if (ev.altKey) {
      this.altPeekPoint = { x: ev.clientX, y: ev.clientY };
      this.scheduleSync();
    } else if (this.altPeekPoint) {
      this.altPeekPoint = null;
      this.scheduleSync();
    }
  }

  private ensureRoot(): HTMLDivElement | null {
    if (this.layer && this.host?.isConnected) return this.layer;
    const rootTarget = document.documentElement;
    if (!rootTarget) return null;

    if (!this.host) {
      const host = document.createElement('gb-overlay-root');
      host.setAttribute('aria-hidden', 'true');
      host.style.cssText =
        'position:fixed !important;inset:0 !important;width:100vw !important;height:100vh !important;pointer-events:none !important;z-index:2147483646 !important;margin:0 !important;padding:0 !important;border:0 !important;background:transparent !important;display:block !important;';
      const shadow = host.attachShadow({ mode: 'closed' });
      const style = document.createElement('style');
      style.textContent = SHADOW_STYLES;
      const layer = document.createElement('div');
      layer.className = 'gb-layer';
      shadow.append(style, layer);
      this.host = host;
      this.shadowRoot = shadow;
      this.layer = layer;
    }

    if (!this.host.isConnected) {
      rootTarget.appendChild(this.host);
    }
    return this.layer;
  }

  private getOrCreateEntry(element: Element): ElementOverlayEntry | null {
    const existing = this.entries.get(element);
    if (existing) return existing;

    const layer = this.ensureRoot();
    if (!layer) return null;

    const container = document.createElement('div');
    container.className = 'gb-media-wrap';
    layer.appendChild(container);

    const entry: ElementOverlayEntry = {
      element,
      container,
      phase: 'clear',
      verdict: null,
      liveRegions: null,
      manualOverride: null,
      lastKey: '',
    };
    this.entries.set(element, entry);
    this.tracked.add(element);
    this.resizeObserver?.observe(element);
    return entry;
  }

  setScanning(element: Element): void {
    if (!this.settings.enabled || !this.settings.zeroFlashShield) return;
    const entry = this.getOrCreateEntry(element);
    if (!entry || entry.manualOverride === 'reveal') return;
    entry.phase = 'scanning';
    entry.verdict = null;
    entry.liveRegions = null;
    entry.lastKey = '';
    this.syncEntry(entry);
  }

  setVerdict(element: Element, verdict: DetectionVerdict): void {
    const entry = this.getOrCreateEntry(element);
    if (!entry) return;
    entry.verdict = verdict;
    entry.liveRegions = null;
    entry.phase = verdict.action === 'clear' ? 'clear' : 'masked';
    entry.lastKey = '';
    this.syncEntry(entry);
  }

  setLiveRegions(element: Element, regions: RegionBox[], fallbackFull = false): void {
    const entry = this.entries.get(element);
    if (!entry) return;
    if (fallbackFull) {
      entry.phase = 'masked';
      entry.verdict = {
        action: 'full-mask',
        regions: [],
        nsfwScore: 0.9,
        ambientColor: [20, 28, 34],
        fromCache: false,
        latencyMs: 0,
        backend: 'wasm',
      };
      entry.liveRegions = null;
    } else if (regions.length > 0) {
      entry.phase = 'masked';
      entry.liveRegions = regions;
    } else if (!entry.verdict || entry.verdict.action !== 'full-mask') {
      entry.phase = 'clear';
      entry.liveRegions = null;
    }
    entry.lastKey = '';
    this.syncEntry(entry);
  }

  setManualOverride(element: Element, mode: 'mask' | 'reveal', regions?: RegionBox[]): void {
    const entry = this.getOrCreateEntry(element);
    if (!entry) return;
    entry.manualOverride = mode;
    if (mode === 'mask' && regions && regions.length > 0) {
      entry.manualOverride = null;
      entry.verdict = {
        action: 'surgical-mask',
        regions,
        nsfwScore: 0,
        ambientColor: [20, 28, 34],
        fromCache: false,
        latencyMs: 0,
        backend: 'wasm',
      };
      entry.liveRegions = null;
      entry.phase = 'masked';
    } else {
      entry.phase = mode === 'mask' ? 'masked' : 'clear';
    }
    entry.lastKey = '';
    this.syncEntry(entry);
  }

  clearAll(): void {
    for (const el of this.tracked) {
      const entry = this.entries.get(el);
      if (entry) {
        entry.container.remove();
        this.resizeObserver?.unobserve(el);
      }
      this.entries.delete(el);
    }
    this.tracked.clear();
  }

  removeElement(element: Element): void {
    const entry = this.entries.get(element);
    if (entry) {
      entry.container.remove();
      this.resizeObserver?.unobserve(element);
      this.entries.delete(element);
    }
    this.tracked.delete(element);
  }

  scheduleSync(): void {
    if (this.syncScheduled) return;
    this.syncScheduled = true;
    requestAnimationFrame(() => {
      this.syncScheduled = false;
      this.syncAll();
    });
  }

  syncAll(): void {
    for (const el of Array.from(this.tracked)) {
      if (!el.isConnected) {
        this.removeElement(el);
        continue;
      }
      const entry = this.entries.get(el);
      if (entry) this.syncEntry(entry);
    }
  }

  private getIntrinsicDimensions(el: Element, rect: DOMRect): { nw: number; nh: number; objectFit: string; objectPos: string } {
    const cs = getComputedStyle(el);
    const objectFit = cs.objectFit || 'fill';
    const objectPos = cs.objectPosition || '50% 50%';
    if (el instanceof HTMLImageElement) {
      return {
        nw: el.naturalWidth || rect.width,
        nh: el.naturalHeight || rect.height,
        objectFit,
        objectPos,
      };
    }
    if (el instanceof HTMLVideoElement) {
      return {
        nw: el.videoWidth || rect.width,
        nh: el.videoHeight || rect.height,
        objectFit,
        objectPos,
      };
    }
    return { nw: rect.width, nh: rect.height, objectFit: 'fill', objectPos: '50% 50%' };
  }

  private applyMaskVisualStyles(el: HTMLDivElement, ambient: [number, number, number]): void {
    const { maskStyle, blurIntensityPx, grayscaleMask } = this.settings;
    const gray = grayscaleMask ? ' grayscale(100%)' : '';
    if (maskStyle === 'surgical-ambient') {
      el.style.background = `rgb(${ambient[0]}, ${ambient[1]}, ${ambient[2]})`;
      el.style.backdropFilter = 'none';
      return;
    }
    if (maskStyle === 'surgical-pixelate') {
      el.classList.add('gb-pixelate');
      el.style.backdropFilter = `blur(${Math.max(10, Math.round(blurIntensityPx * 0.55))}px)${gray}`;
      el.style.backgroundColor = 'rgba(15, 23, 42, 0.35)';
      return;
    }
    el.style.backdropFilter = `blur(${blurIntensityPx}px)${gray}`;
    el.style.background = 'rgba(12, 18, 24, 0.28)';
  }

  private syncEntry(entry: ElementOverlayEntry): void {
    const { container, element } = entry;
    if (!this.settings.enabled || entry.manualOverride === 'reveal') {
      container.style.display = 'none';
      return;
    }

    const rect = element.getBoundingClientRect();
    const cs = getComputedStyle(element);
    if (
      rect.width < 20 ||
      rect.height < 20 ||
      cs.display === 'none' ||
      cs.visibility === 'hidden' ||
      rect.bottom < -100 ||
      rect.top > window.innerHeight + 100
    ) {
      container.style.display = 'none';
      return;
    }

    if (entry.phase === 'clear') {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';
    container.style.left = `${rect.left}px`;
    container.style.top = `${rect.top}px`;
    container.style.width = `${rect.width}px`;
    container.style.height = `${rect.height}px`;

    const isPeeking =
      this.altPeekPoint !== null &&
      this.altPeekPoint.x >= rect.left &&
      this.altPeekPoint.x <= rect.right &&
      this.altPeekPoint.y >= rect.top &&
      this.altPeekPoint.y <= rect.bottom;
    container.classList.toggle('gb-peek', isPeeking);

    if (entry.phase === 'scanning') {
      const key = `scan:${Math.round(rect.width)}x${Math.round(rect.height)}`;
      if (entry.lastKey === key) return;
      entry.lastKey = key;
      container.replaceChildren();
      const box = document.createElement('div');
      box.className = 'gb-scanning';
      container.appendChild(box);
      return;
    }

    const forceFull =
      entry.manualOverride === 'mask' ||
      entry.verdict?.action === 'full-mask' ||
      this.settings.maskStyle === 'whole-blur';
    const ambient = entry.verdict?.ambientColor ?? [20, 28, 34];

    if (forceFull) {
      const key = `full:${this.settings.maskStyle}:${this.settings.blurIntensityPx}:${this.settings.grayscaleMask}:${ambient.join(',')}`;
      if (entry.lastKey === key) return;
      entry.lastKey = key;
      container.replaceChildren();
      const full = document.createElement('div');
      full.className = 'gb-mask-box gb-full';
      this.applyMaskVisualStyles(full, ambient);
      container.appendChild(full);
      return;
    }

    const regions = entry.liveRegions ?? entry.verdict?.regions ?? [];
    const { nw, nh, objectFit, objectPos } = this.getIntrinsicDimensions(element, rect);
    const contentRect = computeMediaContentRect(
      rect.width,
      rect.height,
      nw,
      nh,
      objectFit,
      objectPos
    );

    const projected = regions
      .map((r) => projectRegionToElement(r, contentRect, rect.width, rect.height))
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (projected.length === 0) {
      container.style.display = 'none';
      return;
    }

    const key =
      `surg:${this.settings.maskStyle}:${this.settings.blurIntensityPx}:` +
      projected.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)},${p.w.toFixed(1)},${p.h.toFixed(1)}`).join('|');
    if (entry.lastKey === key) return;
    entry.lastKey = key;

    container.replaceChildren();
    for (const p of projected) {
      const box = document.createElement('div');
      box.className = 'gb-mask-box';
      box.style.left = `${p.x}px`;
      box.style.top = `${p.y}px`;
      box.style.width = `${p.w}px`;
      box.style.height = `${p.h}px`;
      this.applyMaskVisualStyles(box, ambient);
      container.appendChild(box);
    }
  }
}
