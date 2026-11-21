import type { ExtensionSettings } from '@ghadhul-bashar/core';
import type { AnalyzeResponse, RuntimeRequest } from '../shared/messages.js';
import type { SurgicalOverlayManager } from './surgical-overlay.js';
import type { VideoGuardManager } from './video-guard.js';

interface MediaRecord {
  lastAnalyzedSrc: string;
  isIntersecting: boolean;
  inFlight: boolean;
}

const BG_URL_REGEX = /url\(["']?(.*?)["']?\)/i;

export class MediaScanner {
  private readonly records = new WeakMap<Element, MediaRecord>();
  private readonly knownElements = new Set<Element>();
  private readonly observedRoots = new WeakSet<Node>();
  private readonly observers: MutationObserver[] = [];
  private readonly pendingBootstrap: Element[] = [];
  private readonly overlay: SurgicalOverlayManager;
  private readonly videoGuard: VideoGuardManager;
  private settings: ExtensionSettings;
  private readyForIpc = false;
  private disposed = false;
  private io: IntersectionObserver | null = null;
  private rightClickedEl: Element | null = null;

  constructor(
    overlay: SurgicalOverlayManager,
    videoGuard: VideoGuardManager,
    settings: ExtensionSettings
  ) {
    this.overlay = overlay;
    this.videoGuard = videoGuard;
    this.settings = settings;

    if (typeof IntersectionObserver !== 'undefined') {
      this.io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const el = entry.target;
            const rec = this.records.get(el);
            if (rec) {
              rec.isIntersecting = entry.isIntersecting;
            }
            if (el instanceof HTMLVideoElement) {
              this.videoGuard.setIntersecting(el, entry.isIntersecting);
            } else if (entry.isIntersecting) {
              this.evaluateElement(el, false);
            }
          }
        },
        { rootMargin: '350px 0px' }
      );
    }

    // Track last right-clicked media element for context menu manual override
    document.addEventListener(
      'contextmenu',
      (ev) => {
        const target = ev.target instanceof Element ? ev.target : null;
        this.rightClickedEl = target?.closest('img, video, canvas, [style*="background"]') ?? target;
      },
      true
    );

    // Listen to image load / srcset currentSrc changes cleanly without mutating DOM attributes
    document.addEventListener(
      'load',
      (ev) => {
        const target = ev.target;
        if (target instanceof HTMLImageElement) {
          this.evaluateElement(target, false);
        }
      },
      true
    );
  }

  getLastContextElement(): Element | null {
    return this.rightClickedEl;
  }

  activateWithSettings(next: ExtensionSettings): void {
    this.settings = next;
    this.readyForIpc = true;
    this.disposed = false;
    while (this.pendingBootstrap.length > 0) {
      const el = this.pendingBootstrap.shift();
      if (el && el.isConnected) {
        this.evaluateElement(el, true);
      }
    }
  }

  stop(): void {
    this.disposed = true;
    this.readyForIpc = false;
    this.pendingBootstrap.length = 0;
    for (const mo of this.observers) mo.disconnect();
    this.observers.length = 0;
    this.io?.disconnect();
  }

  updateSettings(next: ExtensionSettings): void {
    this.settings = next;
    this.readyForIpc = true;
    this.disposed = false;
    for (const el of Array.from(this.knownElements)) {
      if (!el.isConnected) {
        this.knownElements.delete(el);
        continue;
      }
      const rec = this.records.get(el);
      if (rec) rec.lastAnalyzedSrc = '';
      if (next.enabled) {
        this.evaluateElement(el, true);
      }
    }
  }

  observeRoot(root: Document | ShadowRoot | Element): void {
    if (this.observedRoots.has(root)) return;
    this.observedRoots.add(root);

    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'childList') {
          for (const added of m.addedNodes) {
            if (added instanceof Element) {
              this.scanSubtree(added);
            }
          }
        } else if (m.type === 'attributes' && m.target instanceof Element) {
          if (m.target instanceof HTMLImageElement || m.target instanceof HTMLVideoElement) {
            this.evaluateElement(m.target, false);
          } else if (m.target instanceof HTMLSourceElement && m.target.parentElement) {
            const img = m.target.parentElement.querySelector('img');
            if (img) this.evaluateElement(img, false);
          } else if (m.attributeName === 'style') {
            this.checkBackgroundElement(m.target);
          }
        }
      }
    });

    mo.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'srcset', 'data-src', 'style', 'poster'],
    });
    this.observers.push(mo);

    if (root instanceof Element || root instanceof Document || root instanceof ShadowRoot) {
      this.scanSubtree(root);
    }
  }

  scanSubtree(root: ParentNode): void {
    if (root instanceof Element) {
      if (root.localName === 'gb-overlay-root') return;
      this.inspectSingleElement(root);
      if (root.shadowRoot) {
        this.observeRoot(root.shadowRoot);
      }
    }

    const mediaNodes = root.querySelectorAll('img, video, canvas, svg');
    for (const node of mediaNodes) {
      this.inspectSingleElement(node);
    }

    // Inspect inline styled backgrounds and shadow hosts efficiently
    const styled = root.querySelectorAll('[style*="background"]');
    for (const el of styled) {
      this.checkBackgroundElement(el);
    }

    // Check open shadow roots on custom elements
    const all = root.querySelectorAll('*');
    for (const el of all) {
      if (el.shadowRoot && !this.observedRoots.has(el.shadowRoot)) {
        this.observeRoot(el.shadowRoot);
      }
    }
  }

  private inspectSingleElement(el: Element): void {
    if (el instanceof HTMLImageElement) {
      this.registerElement(el);
      this.evaluateElement(el, false);
    } else if (el instanceof HTMLVideoElement) {
      this.registerElement(el);
      this.videoGuard.register(el);
    } else if (el instanceof HTMLCanvasElement) {
      if (el.id === 'gb-in-canvas') return;
      this.registerElement(el);
      this.evaluateElement(el, false);
    } else if (el instanceof SVGSVGElement) {
      if (el.querySelector('image')) {
        this.registerElement(el);
        this.evaluateElement(el, false);
      }
    }
  }

  private checkBackgroundElement(el: Element): void {
    const bg = (el as HTMLElement).style?.backgroundImage || getComputedStyle(el).backgroundImage;
    if (!bg || bg === 'none' || !bg.includes('url(')) return;
    const rect = el.getBoundingClientRect();
    if (rect.width < 36 && rect.height < 36 && rect.width !== 0) return;
    this.registerElement(el);
    this.evaluateElement(el, false);
  }

  private registerElement(el: Element): void {
    if (this.records.has(el)) return;
    this.records.set(el, {
      lastAnalyzedSrc: '',
      isIntersecting: true,
      inFlight: false,
    });
    this.knownElements.add(el);
    this.io?.observe(el);
  }

  private resolveImageSrc(el: HTMLImageElement): string {
    return el.currentSrc || el.src || el.getAttribute('data-src') || '';
  }

  private captureElementDataUrl(el: HTMLCanvasElement | HTMLImageElement): string | null {
    try {
      const w = el instanceof HTMLCanvasElement ? el.width : el.naturalWidth;
      const h = el instanceof HTMLCanvasElement ? el.height : el.naturalHeight;
      if (w < 28 || h < 28) return null;
      const scale = Math.min(1, 480 / Math.max(w, h));
      const cw = Math.max(1, Math.round(w * scale));
      const ch = Math.max(1, Math.round(h * scale));
      const tmp = document.createElement('canvas');
      tmp.width = cw;
      tmp.height = ch;
      const ctx = tmp.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(el, 0, 0, cw, ch);
      return tmp.toDataURL('image/jpeg', 0.8);
    } catch {
      return null;
    }
  }

  private evaluateElement(el: Element, force: boolean): void {
    if (this.disposed) return;
    if (!this.readyForIpc) {
      this.overlay.setScanning(el);
      if (!this.pendingBootstrap.includes(el)) {
        this.pendingBootstrap.push(el);
      }
      return;
    }
    if (!this.settings.enabled) return;
    if (el instanceof HTMLVideoElement) {
      this.videoGuard.register(el);
      return;
    }

    const rec = this.records.get(el);
    if (!rec) {
      this.registerElement(el);
      return this.evaluateElement(el, force);
    }

    if (el instanceof HTMLImageElement) {
      const src = this.resolveImageSrc(el);
      if (!src) return;
      if (!force && rec.lastAnalyzedSrc === src) return;

      // Skip known tiny decorative icons once natural dimensions are resolved
      if (el.complete && el.naturalWidth > 0 && (el.naturalWidth < 28 || el.naturalHeight < 28)) {
        rec.lastAnalyzedSrc = src;
        this.overlay.setVerdict(el, {
          action: 'clear',
          regions: [],
          nsfwScore: 0,
          ambientColor: [24, 32, 38],
          fromCache: true,
          latencyMs: 0,
          backend: 'wasm',
        });
        return;
      }

      if (this.settings.zeroFlashShield && !rec.inFlight) {
        this.overlay.setScanning(el);
      }

      const priority = rec.isIntersecting ? 10 : 2;
      if (src.startsWith('blob:')) {
        if (!el.complete || el.naturalWidth === 0) return;
        const dataUrl = this.captureElementDataUrl(el);
        if (!dataUrl) return;
        this.dispatchFrameAnalysis(el, rec, src, dataUrl, priority);
      } else {
        this.dispatchUrlAnalysis(el, rec, src, priority);
      }
      return;
    }

    if (el instanceof HTMLCanvasElement) {
      const sig = `canvas:${el.width}x${el.height}`;
      if (!force && rec.lastAnalyzedSrc === sig) return;
      const dataUrl = this.captureElementDataUrl(el);
      if (!dataUrl) return;
      if (this.settings.zeroFlashShield) this.overlay.setScanning(el);
      this.dispatchFrameAnalysis(el, rec, sig, dataUrl, rec.isIntersecting ? 9 : 2);
      return;
    }

    if (el instanceof SVGSVGElement) {
      const imgChild = el.querySelector('image');
      const href = imgChild?.getAttribute('href') || imgChild?.getAttribute('xlink:href') || '';
      if (!href || (!force && rec.lastAnalyzedSrc === href)) return;
      if (this.settings.zeroFlashShield) this.overlay.setScanning(el);
      this.dispatchUrlAnalysis(el, rec, href, rec.isIntersecting ? 8 : 2);
      return;
    }

    // CSS background-image
    const bgStr = (el as HTMLElement).style?.backgroundImage || getComputedStyle(el).backgroundImage;
    const match = bgStr.match(BG_URL_REGEX);
    const bgUrl = match?.[1];
    if (!bgUrl || bgUrl.startsWith('data:image/svg+xml')) return;
    if (!force && rec.lastAnalyzedSrc === bgUrl) return;
    if (this.settings.zeroFlashShield) this.overlay.setScanning(el);
    this.dispatchUrlAnalysis(el, rec, bgUrl, rec.isIntersecting ? 8 : 2);
  }

  private dispatchUrlAnalysis(
    el: Element,
    rec: MediaRecord,
    url: string,
    priority: number
  ): void {
    if (rec.inFlight && rec.lastAnalyzedSrc === url) return;
    rec.lastAnalyzedSrc = url;
    rec.inFlight = true;

    chrome.runtime.sendMessage(
      { type: 'GB_ANALYZE_URL', url, priority } satisfies RuntimeRequest,
      (resp: AnalyzeResponse | undefined) => {
        rec.inFlight = false;
        if (chrome.runtime.lastError || !resp?.ok || !resp.verdict) {
          if (!this.settings.failClosedOnError) {
            this.overlay.setVerdict(el, {
              action: 'clear',
              regions: [],
              nsfwScore: 0,
              ambientColor: [24, 32, 38],
              fromCache: false,
              latencyMs: 0,
              backend: 'wasm',
            });
          }
          return;
        }
        this.overlay.setVerdict(el, resp.verdict);
      }
    );
  }

  private dispatchFrameAnalysis(
    el: Element,
    rec: MediaRecord,
    key: string,
    dataUrl: string,
    priority: number
  ): void {
    if (rec.inFlight && rec.lastAnalyzedSrc === key) return;
    rec.lastAnalyzedSrc = key;
    rec.inFlight = true;

    chrome.runtime.sendMessage(
      {
        type: 'GB_ANALYZE_FRAME',
        dataUrl,
        cacheKey: key,
        isVideoKeyframe: false,
        priority,
      } satisfies RuntimeRequest,
      (resp: AnalyzeResponse | undefined) => {
        rec.inFlight = false;
        if (chrome.runtime.lastError || !resp?.ok || !resp.verdict) {
          if (!this.settings.failClosedOnError) {
            this.overlay.setVerdict(el, {
              action: 'clear',
              regions: [],
              nsfwScore: 0,
              ambientColor: [24, 32, 38],
              fromCache: false,
              latencyMs: 0,
              backend: 'wasm',
            });
          }
          return;
        }
        this.overlay.setVerdict(el, resp.verdict);
      }
    );
  }
}
