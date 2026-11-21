# Privacy Policy — Ghadhul Bashar (`غض البصر`)

**Effective Date:** November 21, 2026  
**License:** GNU Affero General Public License v3.0 (`AGPL-3.0`)  
**Repository:** https://github.com/ridloabelian/ghadhul-bashar

---

## 1. 100% On-Device Processing (Zero Data Leaves Your Browser)

Ghadhul Bashar (`غض البصر`) is built with a strict **Zero-Network Telemetry & Zero-Cloud Inference** architecture:

- **No images, video frames, screenshots, URLs, or browsing history are ever transmitted** to any developer server, cloud API, or third-party service.
- **All four quantized ONNX AI models** (`NudeNet-320n`, `YuNet 2023mar`, `Intel AGR0013 Age-Gender`, and `Marqo ViT-Tiny NSFW`) and the `onnxruntime-web` WASM/WebGPU runtime are **bundled offline inside the extension package**.
- **No analytics, crash reporters, advertising SDKs, external CDNs, or tracking cookies** exist anywhere in the codebase.

---

## 2. Local Browser Storage Usage

All extension state stays strictly inside your local browser profile:

1. **`chrome.storage.local` (`gb_settings_v1`):** Stores your chosen Fiqh profile (`brothers`, `sisters`, `family`, `strict`, `nsfw-only`), visual mask style, sensitivity thresholds, language preference (`id`, `en`, `ar`), domain allowlist (`whitelist`), and offline Time-Lock / `PBKDF2-SHA-256` salted Partner PIN hash.
2. **Local IndexedDB (`gb_vision_cache_v1`):** Stores bounded LRU perceptual `dHash` & URL-hash detection outputs locally so previously analyzed media resolves in `< 0.1 ms` without re-running ONNX. You can wipe this local cache at any time via **Options → Clear Local Detection Cache**.

---

## 3. Configuration Export & Import

When you export settings via **Options → Export Config (.json)**, Ghadhul Bashar intentionally **omits all `timeLock` PIN hashes, salts, and lock timestamps** from the exported JSON file so backups can be shared safely without exposing sensitive credentials.

---

## 4. Permissions Transparency

| Permission | Why It Is Needed (On-Device Only) |
| :--- | :--- |
| `storage` | Persists local preferences, whitelist, and offline Time-Lock state. |
| `offscreen` (Chrome MV3) | Runs the local WebGPU / WASM SIMD ONNX engine inside an isolated offscreen document. |
| `contextMenus` | Provides right-click manual mask/reveal overrides on images and videos. |
| `activeTab` | Reads the active tab's hostname in the popup for one-click site whitelisting and captures visible tab regions *only* for local cross-origin video fallback frames when CORS blocks canvas readback. |
| `<all_urls>` host access | Allows the background/offscreen worker to fetch images on pages you visit locally without CORS errors and protects all `<frame>`/`<iframe>` content (`all_frames: true`) before pixels render. |

---

## 5. Contact & Open-Source Verification

Because Ghadhul Bashar is 100% open source under `AGPL-3.0`, anyone can inspect the source code, run `npm run build`, and verify zero external network calls via automated checks in `scripts/build-extension.mjs`.  
Questions or security disclosures: https://github.com/ridloabelian/ghadhul-bashar/issues
