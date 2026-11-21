import type { AnalyzeResponse, RuntimeRequest } from '../shared/messages.js';
import { InferenceHost } from './inference-host.js';

const host = new InferenceHost();

// Pre-warm ONNX Runtime sessions immediately upon offscreen startup.
void host.ensureEngine().catch((err) => {
  console.error('[Ghadhul Bashar] Engine warmup failed:', err);
});

chrome.runtime.onMessage.addListener(
  (message: RuntimeRequest, _sender, sendResponse) => {
    if (message.type === 'GB_OFFSCREEN_ANALYZE_URL') {
      host
        .analyzeUrl(message.url, message.priority)
        .then(({ raw, fromCache }) =>
          sendResponse({ ok: true, raw, fromCache } satisfies AnalyzeResponse)
        )
        .catch((err) =>
          sendResponse({
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          } satisfies AnalyzeResponse)
        );
      return true;
    }

    if (message.type === 'GB_OFFSCREEN_ANALYZE_FRAME') {
      host
        .analyzeDataUrl(
          message.dataUrl,
          message.cacheKey,
          message.isVideoKeyframe,
          message.priority
        )
        .then(({ raw, fromCache }) =>
          sendResponse({ ok: true, raw, fromCache } satisfies AnalyzeResponse)
        )
        .catch((err) =>
          sendResponse({
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          } satisfies AnalyzeResponse)
        );
      return true;
    }

    if (message.type === 'GB_GET_ENGINE_STATUS') {
      sendResponse(host.getStatus());
      return false;
    }

    if (message.type === 'GB_OFFSCREEN_CLEAR_CACHE') {
      host
        .clearCache()
        .then(() => sendResponse({ ok: true }))
        .catch(() => sendResponse({ ok: false }));
      return true;
    }

    if (message.type === 'GB_OFFSCREEN_BENCHMARK_ANALYZE') {
      host
        .benchmarkDataUrl(message.dataUrl, message.cascadeMode)
        .then((raw) => sendResponse({ ok: true, raw } satisfies AnalyzeResponse))
        .catch((err) =>
          sendResponse({
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          } satisfies AnalyzeResponse)
        );
      return true;
    }

    return false;
  }
);
