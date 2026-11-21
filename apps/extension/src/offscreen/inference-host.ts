import { type RawDetectionOutput } from '@ghadhul-bashar/core';
import { VisionEngine } from '@ghadhul-bashar/vision';
import * as ort from 'onnxruntime-web';
import { sha256Hex, TwoTierVisionCache } from '../shared/cache.js';

interface QueuedTask {
  priority: number;
  isVideoKeyframe?: boolean;
  dedupeKey?: string;
  run: () => Promise<{ raw: RawDetectionOutput; fromCache: boolean }>;
  resolve: (val: { raw: RawDetectionOutput; fromCache: boolean }) => void;
  reject: (err: unknown) => void;
}

const MIN_MEDIA_PX = 28;
const MAX_DECODE_DIM = 640;

export class InferenceHost {
  private enginePromise: Promise<VisionEngine> | null = null;
  private activeBackend: 'webgpu' | 'wasm' | 'idle' = 'idle';
  private readonly cache = new TwoTierVisionCache();
  private readonly queue: QueuedTask[] = [];
  private readonly inFlightUrls = new Map<string, Promise<{ raw: RawDetectionOutput; fromCache: boolean }>>();
  private processing = false;

  getStatus(): { ready: boolean; backend: 'webgpu' | 'wasm' | 'idle' } {
    return { ready: this.activeBackend !== 'idle', backend: this.activeBackend };
  }

  async ensureEngine(): Promise<VisionEngine> {
    if (!this.enginePromise) {
      this.enginePromise = VisionEngine.create(ort, {
        modelUrl: (filename) => chrome.runtime.getURL(`models/${filename}`),
        wasmPaths: chrome.runtime.getURL('wasm/'),
        preferWebGpu: true,
      })
        .then((engine) => {
          this.activeBackend = engine.backend;
          return engine;
        })
        .catch((err) => {
          this.enginePromise = null;
          throw err;
        });
    }
    return this.enginePromise;
  }

  private enqueue(task: Omit<QueuedTask, 'resolve' | 'reject'>): Promise<{ raw: RawDetectionOutput; fromCache: boolean }> {
    return new Promise((resolve, reject) => {
      // Drop stale queued video keyframes if queue already holds video frames to prevent backlog lag
      if (task.isVideoKeyframe) {
        for (let i = this.queue.length - 1; i >= 0; i--) {
          if (this.queue[i]?.isVideoKeyframe) {
            const stale = this.queue.splice(i, 1)[0];
            stale?.resolve({
              raw: {
                regions: [],
                nsfwScore: 0,
                ambientColor: [24, 32, 38],
                backend: this.activeBackend === 'idle' ? 'wasm' : this.activeBackend,
                latencyMs: 0,
              },
              fromCache: false,
            });
          }
        }
      }

      const item: QueuedTask = { ...task, resolve, reject };
      // Insert ordered by descending priority
      const idx = this.queue.findIndex((q) => q.priority < item.priority);
      if (idx === -1) {
        this.queue.push(item);
      } else {
        this.queue.splice(idx, 0, item);
      }
      void this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      while (this.queue.length > 0) {
        const next = this.queue.shift();
        if (!next) break;
        try {
          const result = await next.run();
          next.resolve(result);
        } catch (err) {
          next.reject(err);
        }
      }
    } finally {
      this.processing = false;
    }
  }

  async analyzeUrl(
    url: string,
    priority = 10
  ): Promise<{ raw: RawDetectionOutput; fromCache: boolean }> {
    const urlKey = await sha256Hex(url);
    const cachedByUrl = await this.cache.getByUrlKey(urlKey);
    if (cachedByUrl) {
      return { raw: cachedByUrl, fromCache: true };
    }

    const existing = this.inFlightUrls.get(urlKey);
    if (existing) {
      return existing.then((res) => ({ raw: res.raw, fromCache: true }));
    }

    const promise = this.enqueue({
      priority,
      dedupeKey: urlKey,
      run: async () => {
        const res = await fetch(url, { credentials: 'omit', cache: 'force-cache' });
        if (!res.ok) {
          throw new Error(`Fetch failed (${res.status}) for image`);
        }
        const blob = await res.blob();
        if (blob.type.includes('svg')) {
          const emptySvg: RawDetectionOutput = {
            regions: [],
            nsfwScore: 0,
            ambientColor: [24, 32, 38],
            backend: this.activeBackend === 'idle' ? 'wasm' : this.activeBackend,
            latencyMs: 0,
          };
          return { raw: emptySvg, fromCache: false };
        }
        return this.analyzeBlob(blob, urlKey, false);
      },
    }).finally(() => {
      this.inFlightUrls.delete(urlKey);
    });

    this.inFlightUrls.set(urlKey, promise);
    return promise;
  }

  async analyzeDataUrl(
    dataUrl: string,
    cacheKey?: string,
    isVideoKeyframe = false,
    priority = 8
  ): Promise<{ raw: RawDetectionOutput; fromCache: boolean }> {
    if (cacheKey && !isVideoKeyframe) {
      const key = await sha256Hex(cacheKey);
      const cached = await this.cache.getByUrlKey(key);
      if (cached) return { raw: cached, fromCache: true };
    }

    return this.enqueue({
      priority,
      isVideoKeyframe,
      run: async () => {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const key = cacheKey ? await sha256Hex(cacheKey) : '';
        return this.analyzeBlob(blob, key, isVideoKeyframe);
      },
    });
  }

  private async analyzeBlob(
    blob: Blob,
    urlKey: string,
    isVideoKeyframe: boolean
  ): Promise<{ raw: RawDetectionOutput; fromCache: boolean }> {
    let bitmap: ImageBitmap | null = null;
    try {
      bitmap = await createImageBitmap(blob);
      if (bitmap.width < MIN_MEDIA_PX || bitmap.height < MIN_MEDIA_PX) {
        const empty: RawDetectionOutput = {
          regions: [],
          nsfwScore: 0,
          ambientColor: [24, 32, 38],
          backend: this.activeBackend === 'idle' ? 'wasm' : this.activeBackend,
          latencyMs: 0,
        };
        if (urlKey) await this.cache.put(urlKey, '', empty);
        return { raw: empty, fromCache: false };
      }

      const engine = await this.ensureEngine();
      const maxDim = Math.max(bitmap.width, bitmap.height);
      let analyzeSource: ImageBitmap | OffscreenCanvas = bitmap;
      let targetW = bitmap.width;
      let targetH = bitmap.height;

      if (maxDim > MAX_DECODE_DIM) {
        const scale = MAX_DECODE_DIM / maxDim;
        targetW = Math.max(1, Math.round(bitmap.width * scale));
        targetH = Math.max(1, Math.round(bitmap.height * scale));
        const down = new OffscreenCanvas(targetW, targetH);
        const dCtx = down.getContext('2d');
        if (dCtx) {
          dCtx.drawImage(bitmap, 0, 0, targetW, targetH);
          analyzeSource = down;
        }
      }

      const dhash = engine.computeSourceDHash(analyzeSource, targetW, targetH);
      if (!isVideoKeyframe) {
        const similar = this.cache.getByDHash(dhash);
        if (similar) {
          if (urlKey) await this.cache.put(urlKey, dhash, similar);
          return { raw: similar, fromCache: true };
        }
      }

      const raw = await engine.analyzeSource(analyzeSource, targetW, targetH, {
        runNsfw: true,
        minConfidence: 0.14,
        maxFaces: isVideoKeyframe ? 6 : 16,
      });

      if (!isVideoKeyframe && urlKey) {
        await this.cache.put(urlKey, dhash, raw);
      }
      return { raw, fromCache: false };
    } finally {
      bitmap?.close();
    }
  }
}
