import {
  computeDHash64,
  type BodyPartClass,
  type RawDetectionOutput,
  type RegionBox,
} from '@ghadhul-bashar/core';
import type * as OrtNamespace from 'onnxruntime-web';
import {
  boxIoU,
  clamp01,
  classAwareNms,
  mergeFaceCandidates,
  NUDENET_LABELS,
  type RawFaceCandidate,
} from './nms.js';
import { computeOutsideFaceSkin, profileVisualSignals } from './signals.js';

export type OrtModule = typeof OrtNamespace;

export interface VisionEngineConfig {
  modelUrl: (filename: string) => string;
  wasmPaths?: string;
  preferWebGpu?: boolean;
}

export interface AnalyzeOptions {
  runNsfw?: boolean;
  minConfidence?: number;
  maxFaces?: number;
  cascadeMode?: 'adaptive' | 'legacy-full';
}

const MODEL_FILES = {
  nudenet: 'nudenet-320n.quant.onnx',
  yunet: 'yunet-2023mar.onnx',
  ageGender: 'agr0013-age-gender.quant.onnx',
  nsfw: 'marqo-nsfw-tiny.quant.onnx',
} as const;

const NUDENET_SIZE = 320;
const AGE_GENDER_SIZE = 62;
const NSFW_SIZE = 384;
const YUNET_MIN_INPUT = 128;
const YUNET_MAX_INPUT = 256;

const SEVERE_NUDITY_CLASSES = new Set<BodyPartClass>([
  'FEMALE_BREAST_EXPOSED',
  'FEMALE_GENITALIA_EXPOSED',
  'MALE_GENITALIA_EXPOSED',
  'BUTTOCKS_EXPOSED',
  'ANUS_EXPOSED',
]);

function logit(p: number): number {
  const c = Math.min(1 - 1e-4, Math.max(1e-4, p));
  return Math.log(c / (1 - c));
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

export class VisionEngine {
  private readonly ort: OrtModule;
  private readonly nudenet: OrtNamespace.InferenceSession;
  private readonly yunet: OrtNamespace.InferenceSession;
  private readonly ageGender: OrtNamespace.InferenceSession;
  private readonly nsfw: OrtNamespace.InferenceSession;
  public readonly backend: 'webgpu' | 'wasm';

  private readonly canvases = new Map<string, OffscreenCanvasRenderingContext2D>();
  private disposed = false;

  private constructor(
    ort: OrtModule,
    nudenet: OrtNamespace.InferenceSession,
    yunet: OrtNamespace.InferenceSession,
    ageGender: OrtNamespace.InferenceSession,
    nsfw: OrtNamespace.InferenceSession,
    backend: 'webgpu' | 'wasm'
  ) {
    this.ort = ort;
    this.nudenet = nudenet;
    this.yunet = yunet;
    this.ageGender = ageGender;
    this.nsfw = nsfw;
    this.backend = backend;
  }

  static async create(ort: OrtModule, config: VisionEngineConfig): Promise<VisionEngine> {
    if (config.wasmPaths) {
      ort.env.wasm.wasmPaths = config.wasmPaths;
    }
    ort.env.wasm.simd = true;
    ort.env.wasm.proxy = false;
    // Multi-threaded WASM requires crossOriginIsolated SharedArrayBuffer (often absent in MV3 offscreen).
    const isolated = typeof self !== 'undefined' && (self as { crossOriginIsolated?: boolean }).crossOriginIsolated;
    ort.env.wasm.numThreads = isolated
      ? Math.min(2, (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 1)
      : 1;

    let useWebGpu = false;
    if (config.preferWebGpu !== false && typeof navigator !== 'undefined' && 'gpu' in navigator) {
      try {
        const gpu = (navigator as Navigator & { gpu: { requestAdapter(): Promise<unknown | null> } }).gpu;
        const adapter = await gpu.requestAdapter();
        useWebGpu = adapter !== null;
      } catch {
        useWebGpu = false;
      }
    }

    const loadSession = async (
      bytes: Uint8Array,
      providers: ('webgpu' | 'wasm')[]
    ): Promise<OrtNamespace.InferenceSession> =>
      ort.InferenceSession.create(bytes, {
        executionProviders: providers,
        graphOptimizationLevel: 'all',
        executionMode: 'sequential',
        enableCpuMemArena: true,
        enableMemPattern: true,
        logSeverityLevel: 3,
      });

    const loadModel = async (
      filename: string
    ): Promise<{ session: OrtNamespace.InferenceSession; usedWebGpu: boolean }> => {
      const res = await fetch(config.modelUrl(filename));
      if (!res.ok) {
        throw new Error(`Failed loading ONNX model ${filename}: HTTP ${res.status}`);
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (useWebGpu) {
        try {
          return { session: await loadSession(bytes, ['webgpu', 'wasm']), usedWebGpu: true };
        } catch {
          // Gracefully degrade to WASM SIMD if WebGPU shader compilation fails for any op.
        }
      }
      return { session: await loadSession(bytes, ['wasm']), usedWebGpu: false };
    };

    const mNude = await loadModel(MODEL_FILES.nudenet);
    const mYunet = await loadModel(MODEL_FILES.yunet);
    const mAgeGender = await loadModel(MODEL_FILES.ageGender);
    const mNsfw = await loadModel(MODEL_FILES.nsfw);

    const activeBackend: 'webgpu' | 'wasm' = mNude.usedWebGpu ? 'webgpu' : 'wasm';
    return new VisionEngine(
      ort,
      mNude.session,
      mYunet.session,
      mAgeGender.session,
      mNsfw.session,
      activeBackend
    );
  }

  private getCanvasCtx(width: number, height: number): OffscreenCanvasRenderingContext2D {
    const key = `${width}x${height}`;
    let ctx = this.canvases.get(key);
    if (!ctx) {
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) {
        throw new Error('Failed to create 2D context on OffscreenCanvas');
      }
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'medium';
      ctx = context;
      this.canvases.set(key, ctx);
    }
    return ctx;
  }

  private extractRgba(
    source: CanvasImageSource,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
    cw: number,
    ch: number
  ): Uint8Array {
    const ctx = this.getCanvasCtx(cw, ch);
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
    const imgData = ctx.getImageData(0, 0, cw, ch);
    return new Uint8Array(imgData.data.buffer, imgData.data.byteOffset, imgData.data.byteLength);
  }

  computeSourceDHash(source: CanvasImageSource, width: number, height: number): string {
    const rgba9x8 = this.extractRgba(source, 0, 0, width, height, 0, 0, 9, 8, 9, 8);
    return computeDHash64(rgba9x8);
  }

  private sampleAmbientColor(rgba: Uint8Array, dw: number, dh: number, cw: number): [number, number, number] {
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    let count = 0;
    const sampleCols = Math.max(1, Math.min(8, Math.floor(dw)));
    const sampleRows = Math.max(1, Math.min(8, Math.floor(dh)));
    for (let ry = 0; ry < sampleRows; ry++) {
      const y = Math.floor(((ry + 0.5) / sampleRows) * dh);
      for (let rx = 0; rx < sampleCols; rx++) {
        const x = Math.floor(((rx + 0.5) / sampleCols) * dw);
        const idx = (y * cw + x) * 4;
        rSum += rgba[idx] ?? 0;
        gSum += rgba[idx + 1] ?? 0;
        bSum += rgba[idx + 2] ?? 0;
        count++;
      }
    }
    if (count === 0) return [24, 32, 38];
    return [
      Math.round(rSum / count),
      Math.round(gSum / count),
      Math.round(bSum / count),
    ];
  }

  private async runNudeNet(
    source: CanvasImageSource,
    srcW: number,
    srcH: number,
    minConf: number
  ): Promise<{ boxes: RegionBox[]; ambientColor: [number, number, number] }> {
    const scale = NUDENET_SIZE / Math.max(srcW, srcH);
    const dw = Math.max(1, Math.round(srcW * scale));
    const dh = Math.max(1, Math.round(srcH * scale));
    const rgba = this.extractRgba(
      source,
      0,
      0,
      srcW,
      srcH,
      0,
      0,
      dw,
      dh,
      NUDENET_SIZE,
      NUDENET_SIZE
    );
    const ambientColor = this.sampleAmbientColor(rgba, dw, dh, NUDENET_SIZE);

    const inputName = this.nudenet.inputNames[0] ?? 'pixels';
    const outputName = this.nudenet.outputNames[0] ?? 'output0';
    const tensor = new this.ort.Tensor('uint8', rgba, [1, NUDENET_SIZE, NUDENET_SIZE, 4]);
    let outputs: Record<string, OrtNamespace.Tensor> | null = null;

    try {
      outputs = await this.nudenet.run({ [inputName]: tensor });
      const outTensor = outputs[outputName];
      if (!outTensor) return { boxes: [], ambientColor };
      const data = outTensor.data as Float32Array;
      const anchors = outTensor.dims[2] ?? 2100;
      const numClasses = NUDENET_LABELS.length;
      const rawBoxes: RegionBox[] = [];

      for (let i = 0; i < anchors; i++) {
        let bestCls = -1;
        let bestScore = minConf;
        for (let c = 0; c < numClasses; c++) {
          const score = data[(4 + c) * anchors + i] ?? 0;
          if (score >= bestScore) {
            bestScore = score;
            bestCls = c;
          }
        }
        if (bestCls < 0) continue;

        const cx = data[0 * anchors + i] ?? 0;
        const cy = data[1 * anchors + i] ?? 0;
        const w = data[2 * anchors + i] ?? 0;
        const h = data[3 * anchors + i] ?? 0;

        const x = clamp01((cx - w / 2) / dw);
        const y = clamp01((cy - h / 2) / dh);
        const nw = Math.min(1 - x, clamp01(w / dw));
        const nh = Math.min(1 - y, clamp01(h / dh));
        if (nw <= 0.005 || nh <= 0.005) continue;

        rawBoxes.push({
          x,
          y,
          w: nw,
          h: nh,
          label: NUDENET_LABELS[bestCls]!,
          confidence: bestScore,
        });
      }

      return { boxes: classAwareNms(rawBoxes, 0.45), ambientColor };
    } finally {
      tensor.dispose();
      if (outputs) {
        for (const t of Object.values(outputs)) t.dispose();
      }
    }
  }

  private async runYuNet(
    source: CanvasImageSource,
    srcW: number,
    srcH: number
  ): Promise<RawFaceCandidate[]> {
    const longSide = Math.max(srcW, srcH);
    const S = Math.min(
      YUNET_MAX_INPUT,
      Math.max(YUNET_MIN_INPUT, Math.ceil(longSide / 32) * 32)
    );
    const scale = S / longSide;
    const dw = Math.max(1, Math.round(srcW * scale));
    const dh = Math.max(1, Math.round(srcH * scale));
    const rgba = this.extractRgba(source, 0, 0, srcW, srcH, 0, 0, dw, dh, S, S);

    const inputName = this.yunet.inputNames[0] ?? 'pixels';
    const tensor = new this.ort.Tensor('uint8', rgba, [1, S, S, 4]);
    let outputs: Record<string, OrtNamespace.Tensor> | null = null;

    try {
      outputs = await this.yunet.run({ [inputName]: tensor });
      const candidates: RawFaceCandidate[] = [];

      for (const stride of [8, 16, 32]) {
        const cols = S / stride;
        const cls = outputs[`cls_${stride}`]?.data as Float32Array | undefined;
        const obj = outputs[`obj_${stride}`]?.data as Float32Array | undefined;
        const bbox = outputs[`bbox_${stride}`]?.data as Float32Array | undefined;
        if (!cls || !obj || !bbox) continue;

        for (let i = 0; i < cls.length; i++) {
          const c = clamp01(cls[i] ?? 0);
          const o = clamp01(obj[i] ?? 0);
          const score = Math.sqrt(c * o);
          if (score < 0.55) continue;

          const row = (i / cols) | 0;
          const col = i - row * cols;
          const cx = (col + (bbox[i * 4] ?? 0)) * stride;
          const cy = (row + (bbox[i * 4 + 1] ?? 0)) * stride;
          const bw = Math.exp(bbox[i * 4 + 2] ?? 0) * stride;
          const bh = Math.exp(bbox[i * 4 + 3] ?? 0) * stride;

          const x = clamp01((cx - bw / 2) / dw);
          const y = clamp01((cy - bh / 2) / dh);
          const w = Math.min(1 - x, clamp01(bw / dw));
          const h = Math.min(1 - y, clamp01(bh / dh));
          if (w > 0.005 && h > 0.005) {
            candidates.push({ x, y, w, h, score });
          }
        }
      }

      // Deduplicate YuNet detections via NMS
      candidates.sort((a, b) => b.score - a.score);
      const kept: RawFaceCandidate[] = [];
      for (const cand of candidates) {
        if (kept.every((k) => boxIoU(k, cand) <= 0.30)) {
          kept.push(cand);
        }
      }
      return kept;
    } finally {
      tensor.dispose();
      if (outputs) {
        for (const t of Object.values(outputs)) t.dispose();
      }
    }
  }

  private async runAgeGenderOnFace(
    source: CanvasImageSource,
    srcW: number,
    srcH: number,
    box: RegionBox
  ): Promise<{ femaleProb: number; estimatedAge: number }> {
    const cx = (box.x + box.w / 2) * srcW;
    const cy = (box.y + box.h / 2) * srcH;
    const side = Math.max(box.w * srcW, box.h * srcH) * 1.18;
    const sx = Math.max(0, cx - side / 2);
    const sy = Math.max(0, cy - side / 2);
    const sw = Math.min(srcW - sx, side);
    const sh = Math.min(srcH - sy, side);
    if (sw < 2 || sh < 2) return { femaleProb: 0.5, estimatedAge: 25 };

    const rgba = this.extractRgba(
      source,
      sx,
      sy,
      sw,
      sh,
      0,
      0,
      AGE_GENDER_SIZE,
      AGE_GENDER_SIZE,
      AGE_GENDER_SIZE,
      AGE_GENDER_SIZE
    );
    const inputName = this.ageGender.inputNames[0] ?? 'pixels';
    const tensor = new this.ort.Tensor('uint8', rgba, [1, AGE_GENDER_SIZE, AGE_GENDER_SIZE, 4]);
    let outputs: Record<string, OrtNamespace.Tensor> | null = null;

    try {
      outputs = await this.ageGender.run({ [inputName]: tensor });
      const genderData = outputs.gender?.data as Float32Array | undefined;
      const ageData = outputs.age?.data as Float32Array | undefined;
      const femaleProb = genderData ? clamp01(genderData[0] ?? 0.5) : 0.5;
      const estimatedAge = ageData ? Math.max(0, Math.round((ageData[0] ?? 0.25) * 100)) : 25;
      return { femaleProb, estimatedAge };
    } finally {
      tensor.dispose();
      if (outputs) {
        for (const t of Object.values(outputs)) t.dispose();
      }
    }
  }

  private async runNsfwScore(
    source: CanvasImageSource,
    srcW: number,
    srcH: number
  ): Promise<number> {
    const rgba = this.extractRgba(
      source,
      0,
      0,
      srcW,
      srcH,
      0,
      0,
      NSFW_SIZE,
      NSFW_SIZE,
      NSFW_SIZE,
      NSFW_SIZE
    );
    const inputName = this.nsfw.inputNames[0] ?? 'pixels';
    const tensor = new this.ort.Tensor('uint8', rgba, [1, NSFW_SIZE, NSFW_SIZE, 4]);
    let outputs: Record<string, OrtNamespace.Tensor> | null = null;

    try {
      outputs = await this.nsfw.run({ [inputName]: tensor });
      const out = outputs.nsfw ?? Object.values(outputs)[0];
      const val = (out?.data as Float32Array | undefined)?.[0] ?? 0;
      return clamp01(val);
    } finally {
      tensor.dispose();
      if (outputs) {
        for (const t of Object.values(outputs)) t.dispose();
      }
    }
  }

  async analyzeSource(
    source: CanvasImageSource,
    srcW: number,
    srcH: number,
    options: AnalyzeOptions = {}
  ): Promise<RawDetectionOutput> {
    if (this.disposed) {
      throw new Error('VisionEngine has been disposed');
    }
    const t0 = performance.now();
    const minConf = options.minConfidence ?? 0.14;
    const maxFaces = options.maxFaces ?? 16;
    const cascadeMode = options.cascadeMode ?? 'adaptive';
    const stagesRun: string[] = [];

    // Single-pass 64x64 RGBA probe (<0.4ms) computes ambient color & visual gate signals.
    const rgba64 = this.extractRgba(source, 0, 0, srcW, srcH, 0, 0, 64, 64, 64, 64);
    const signals = profileVisualSignals(rgba64);

    if (cascadeMode === 'legacy-full') {
      const { boxes, ambientColor } = await this.runNudeNet(source, srcW, srcH, minConf);
      stagesRun.push('nudenet');
      const yunetFaces = await this.runYuNet(source, srcW, srcH);
      stagesRun.push('yunet');
      const { merged, faceIndices } = mergeFaceCandidates(boxes, yunetFaces, maxFaces);
      if (faceIndices.length > 0) {
        stagesRun.push('age-gender');
        await this.refineFaces(source, srcW, srcH, merged, boxes, faceIndices);
      }
      let nsfwScore = 0;
      if (options.runNsfw !== false) {
        stagesRun.push('marqo-nsfw');
        nsfwScore = await this.runNsfwScore(source, srcW, srcH);
      }
      return {
        regions: merged,
        nsfwScore,
        ambientColor,
        backend: this.backend,
        latencyMs: Math.round((performance.now() - t0) * 10) / 10,
        stagesRun,
      };
    }

    // Stage 0: Fast non-organic graphic / UI / blank gradient skip
    if (signals.isTrivialGraphic) {
      return {
        regions: [],
        nsfwScore: 0,
        ambientColor: signals.ambientColor,
        backend: this.backend,
        latencyMs: Math.round((performance.now() - t0) * 10) / 10,
        stagesRun: ['signal-skip'],
      };
    }

    // Stage 1: Lightweight YuNet face check (~16-24ms WASM)
    const yunetFaces = await this.runYuNet(source, srcW, srcH);
    stagesRun.push('yunet');
    const preFaceSkin = computeOutsideFaceSkin(rgba64, yunetFaces);

    const maxFaceH = yunetFaces.reduce((m, f) => Math.max(m, f.h), 0);
    const isCleanHeadshot =
      yunetFaces.length > 0 &&
      maxFaceH >= 0.24 &&
      preFaceSkin.outsideSkinRatio < 0.038 &&
      preFaceSkin.outsidePeakBlockSkin < 0.22 &&
      signals.animeSkinRatio < 0.05 &&
      !signals.mangaLineArtSignal;

    const isNonPhotographicBodyScene =
      yunetFaces.length === 0 &&
      signals.skinRatio < 0.022 &&
      signals.peakBlockSkinRatio < 0.16 &&
      !signals.isGrayscaleRichPhoto;

    // Stage 2: Conditional NudeNet-320n for full-body, exposed skin, headless, or monochrome photo scenes
    let nudenetBoxes: RegionBox[] = [];
    let ambientColor = signals.ambientColor;
    if (!isCleanHeadshot && !isNonPhotographicBodyScene) {
      const nude = await this.runNudeNet(source, srcW, srcH, minConf);
      nudenetBoxes = nude.boxes;
      ambientColor = nude.ambientColor;
      stagesRun.push('nudenet');
    }

    // Stage 3: Merge faces & refine gender/age (<10 yrs child exemption)
    const { merged, faceIndices } = mergeFaceCandidates(nudenetBoxes, yunetFaces, maxFaces);
    if (faceIndices.length > 0) {
      stagesRun.push('age-gender');
      await this.refineFaces(source, srcW, srcH, merged, nudenetBoxes, faceIndices);
    }

    // Stage 4: Conditional Marqo ViT-Tiny NSFW only on close-up skin, borderline body cues, or anime/manga
    let nsfwScore = 0;
    if (options.runNsfw !== false) {
      const hasSevereNudity = merged.some(
        (b) => SEVERE_NUDITY_CLASSES.has(b.label) && b.confidence >= 0.28
      );
      if (hasSevereNudity) {
        nsfwScore = 0.88;
      } else {
        const mergedFaces = merged.filter(
          (b) => b.label === 'FACE_FEMALE' || b.label === 'FACE_MALE' || b.label === 'FACE_CHILD'
        );
        const postSkin =
          mergedFaces.length !== yunetFaces.length
            ? computeOutsideFaceSkin(rgba64, mergedFaces)
            : preFaceSkin;
        const hasBodyBoxes = nudenetBoxes.some(
          (b) => b.label !== 'FACE_FEMALE' && b.label !== 'FACE_MALE'
        );
        const hasBorderlineBody = nudenetBoxes.some(
          (b) =>
            b.label !== 'FACE_FEMALE' &&
            b.label !== 'FACE_MALE' &&
            b.confidence >= 0.12 &&
            b.confidence < 0.28
        );
        const needsMarqo =
          ((postSkin.outsideSkinRatio >= 0.16 || postSkin.outsidePeakBlockSkin >= 0.42) && !hasBodyBoxes) ||
          hasBorderlineBody ||
          signals.animeSkinRatio >= 0.07 ||
          signals.mangaLineArtSignal;

        if (needsMarqo) {
          stagesRun.push('marqo-nsfw');
          nsfwScore = await this.runNsfwScore(source, srcW, srcH);
        }
      }
    }

    return {
      regions: merged,
      nsfwScore,
      ambientColor,
      backend: this.backend,
      latencyMs: Math.round((performance.now() - t0) * 10) / 10,
      stagesRun,
    };
  }

  private async refineFaces(
    source: CanvasImageSource,
    srcW: number,
    srcH: number,
    merged: RegionBox[],
    nudenetBoxes: RegionBox[],
    faceIndices: number[]
  ): Promise<void> {
    for (const idx of faceIndices) {
      const box = merged[idx]!;
      const { femaleProb, estimatedAge } = await this.runAgeGenderOnFace(source, srcW, srcH, box);

      const wasYuNetOnly = !nudenetBoxes.some(
        (b) => (b.label === 'FACE_FEMALE' || b.label === 'FACE_MALE') && boxIoU(b, box) >= 0.3
      );

      let finalLabel: BodyPartClass;
      if (estimatedAge < 10) {
        finalLabel = 'FACE_CHILD';
      } else if (wasYuNetOnly) {
        finalLabel = femaleProb >= 0.5 ? 'FACE_FEMALE' : 'FACE_MALE';
      } else {
        const nudeFemaleProb =
          box.label === 'FACE_FEMALE'
            ? Math.max(0.55, box.confidence)
            : Math.min(0.45, 1 - box.confidence);
        const fused = sigmoid(0.45 * logit(nudeFemaleProb) + 0.55 * logit(femaleProb));
        finalLabel = fused >= 0.5 ? 'FACE_FEMALE' : 'FACE_MALE';
      }

      merged[idx] = {
        ...box,
        label: finalLabel,
        estimatedAge,
      };
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    await Promise.all([
      this.nudenet.release(),
      this.yunet.release(),
      this.ageGender.release(),
      this.nsfw.release(),
    ]);
    this.canvases.clear();
  }
}
