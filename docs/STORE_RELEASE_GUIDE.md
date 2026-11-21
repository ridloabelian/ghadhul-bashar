# Store Release Guide — Chrome Web Store & Firefox AMO (`v1.1.0`)

This document contains store-ready metadata, permission justifications, privacy declarations, and reproducible build instructions for publishing **Ghadhul Bashar (`غض البصر`)** on the **Chrome Web Store (CWS)** and **Firefox Add-ons (AMO)**.

---

## 1. Build Verification & Release Artifacts

Run the full release pipeline from the repository root (`Node.js >= 22`, Python `3.12` + `.venv` for optional model verification):

```bash
npm ci
npm run models:verify
npm run typecheck
npm test
npm run zip
```

Generated store archives in `apps/extension/dist/`:
- `ghadhul-bashar-chrome.zip` — Chrome, Brave, Edge (MV3 with `offscreen` inference document)
- `ghadhul-bashar-firefox.zip` — Firefox Desktop & Android `>= 121.0` (MV3 with background module inference host)

---

## 2. Chrome Web Store (CWS) Submission Details

### Listing Copy (English — Primary)
- **Title:** `Ghadhul Bashar (غض البصر) — AI Gaze Shield`
- **Summary (132 chars max):**  
  `100% on-device surgical AI gaze & modesty filter. Blurs faces, awrah & NSFW before pixels flash — zero cloud calls.`
- **Category:** `Accessibility` or `Productivity`
- **Language:** `English`, `Indonesian`, `Arabic`

### Listing Description (Ready to Paste)
> **Ghadhul Bashar (غض البصر)** protects your gaze across the web using fast, 100% on-device AI (`WebGPU` + `WASM SIMD`) — with zero cloud uploads, zero telemetry, and zero page breakage.
>
> **Why Ghadhul Bashar?**
> - **Smart Surgical Masking (Closed Shadow DOM):** Masks only detected adult faces, exposed *awrah* body regions, and inappropriate areas (`Frosted Blur`, `Solid Ambient Fill`, or `Regional Pixelate`) so surrounding slides, code tutorials, and articles stay 100% sharp.
> - **Deterministic Zero-Flash Shield:** Covers incoming media immediately upon DOM discovery until local AI classification finishes — preventing accidental exposure flashes.
> - **5 Modesty Profiles + Automatic Child Exemption (`< 10` yrs):** Switch effortlessly between **Brothers**, **Sisters**, **Family & Kids**, **Strict**, or **NSFW-Only**, or customize granular rules in Full Options.
> - **4-Model Quantized Adaptive Cascade (`< 150 ms`):** Combines `YuNet`, `NudeNet-320n`, `Intel AGR0013 Age-Gender`, and conditional `Marqo ViT-Tiny NSFW` with 64-bit perceptual `dHash` caching (`< 0.1 ms` cache hits).
> - **60 FPS Video Guard & Auto-Mute:** Protects `<video>` playback with instant 16×16 luma scene-cut detection and optional audio auto-mute while masked.
> - **Zero Web Breakage:** Never alters `crossorigin`, `width`, `height`, or React/Next.js hydrated attributes — preventing CORS audio/video playback failures and SSR mismatches.
> - **Offline Self-Control Vault:** Commitment Time-Lock cooldown, offline `PBKDF2-SHA-256` Partner PIN, and encrypted-free JSON configuration backup.
>
> **Open Source (`AGPL-3.0`):** https://github.com/ridloabelian/ghadhul-bashar

### CWS Privacy Practices Tab Answers
- **Single Purpose Description:**  
  `Ghadhul Bashar performs 100% local, on-device visual content filtering (surgical blurring of human faces, exposed body regions, and NSFW imagery/video) according to the user's selected modesty profile.`
- **Permission Justifications:**
  - **`storage`:** Stores user modesty preferences, domain allowlist, and offline Time-Lock/PIN settings locally in `chrome.storage.local`.
  - **`offscreen`:** Hosts the bundled `onnxruntime-web` WASM/WebGPU inference engine outside MV3 service-worker lifetime restrictions without accessing external servers.
  - **`contextMenus`:** Adds right-click manual mask/reveal actions for individual images and videos.
  - **`activeTab`:** Displays the current tab's hostname in the toolbar popup for one-click allowlisting and enables local `captureVisibleTab` fallback on cross-origin `<video>` elements that forbid canvas readback without modifying page CORS attributes.
  - **`<all_urls>` host permission:** Needed to inject the zero-flash content script across all frames (`all_frames: true`) before pixels render and allow the extension offscreen worker to fetch page images locally for ONNX inference even when third-party CDNs omit CORS headers.
- **Data Usage Certifications:**
  - Does this item collect user data? **No** (all 9 data types unchecked).
  - Sold to third parties? **No**.
  - Used for purposes unrelated to single purpose? **No**.
  - Creditworthiness / lending? **No**.
- **Remote Code:** **No remote code is used.** All JS, WASM (`ort-wasm-simd-threaded*.wasm`), and ONNX models (`*.onnx`) are packaged inside the ZIP and enforced by `"content_security_policy": { "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';" }`.

---

## 3. Firefox Add-ons (AMO) Submission & Source Package

Mozilla AMO reviewers require a **Source Code Archive** for bundled/minified extensions alongside `ghadhul-bashar-firefox.zip`.

### Creating the Clean AMO Source Archive
```bash
git archive --format=zip --output=apps/extension/dist/ghadhul-bashar-source-v1.1.0.zip HEAD
```

### Reviewer Reproducible Build Instructions (Paste into "Notes to Reviewer")
```text
Environment:
- OS: Linux x86_64
- Node.js: v22.x (npm v10+)
- No external network calls occur at runtime; all WASM and ONNX models are local static assets in apps/extension/public/models/.

Build steps to reproduce apps/extension/dist/firefox identically:
1. npm ci
2. npm run build
3. Output directory: apps/extension/dist/firefox/ (or run `npm run zip` for apps/extension/dist/ghadhul-bashar-firefox.zip)

Architectural notes:
- Firefox manifest uses background.scripts (ESM module) instead of Chrome offscreen API.
- Content script runs at document_start with closed Shadow DOM (<gb-overlay-root>) and zero DOM attribute mutations.
- No remote code, eval, or external CDN URLs are referenced anywhere in the built bundle (verified automatically by scripts/build-extension.mjs).
```

---

## 4. Store Asset Checklist
- [x] Extension icons (`16x16`, `32x32`, `48x48`, `128x128`) in `apps/extension/public/icons/`
- [x] `PRIVACY.md` hosted publicly (`https://github.com/ridloabelian/ghadhul-bashar/blob/main/PRIVACY.md` or landing site `privacy.html`)
- [ ] Capture `1280x800` screenshots (Popup, Full Options Live Preview, Surgical Masking on YouTube/News feed, Arabic RTL view) before uploading to CWS/AMO dashboards.
