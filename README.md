# Ghadhul Bashar (`غض البصر`)

> **Fast, 100% On-Device Surgical AI Gaze-Protection Platform** — Open Source (`AGPL-3.0`)

Ghadhul Bashar (`ghadhul-bashar`) is built from scratch to solve the architectural, accuracy, privacy, and performance bottlenecks of legacy gaze-protection tools (`HaramBlur`, `NoHaram`, `SafeGaze`, `Porda AI`, `Tahir`, and `NSFW Filter`).

## Key Capabilities

- **Smart Surgical Masking (Closed Shadow DOM):** Masks *only* detected faces, exposed *awrah* body regions, and inappropriate areas (`surgical-frosted`, `surgical-ambient`, or `surgical-pixelate`) so surrounding slides, code tutorials, and product descriptions stay 100% sharp. Automatically escalates to full cover on high NSFW probability.
- **Deterministic Zero-Flash Shield (`0 ms`):** Covers incoming media with a smooth frosted shimmer from DOM discovery until AI classification resolves — never flashing unverified pixels or self-unblurring after an arbitrary timeout.
- **4-Model Quantized ONNX Cascade (~19 MB Total, WebGPU + WASM SIMD):**
  - `NudeNet-320n` (quantized): 18 body-part & gender bounding-box classes (works on headless/back-turned shots).
  - `YuNet 2023mar`: catches small, angled, and crowded faces (up to 16 faces per frame).
  - `Intel Age-Gender (AGR0013)`: continuous age estimation (**automatically exempts children `< 10` years**) + gender fusion.
  - `Marqo ViT-Tiny NSFW` (quantized): catches explicit close-ups, drawings, and B&W manga.
- **64-bit Perceptual `dHash` + Two-Tier Cache (`< 0.1 ms`):** Resized or re-signed CDN images resolve instantly without re-running ONNX.
- **60 FPS Video Guard & 16×16 Luma Scene-Cut Shield:** Viewport-gated `requestVideoFrameCallback` loop with Kalman/IoU tracking + instant scene-cut shield + optional **Auto-Mute on Blur** (`0%` CPU on hidden tabs or off-screen videos).
- **Zero-Breakage Web Compatibility:** Never mutates `crossorigin`, `width`, `height`, or React/Next.js hydrated attributes — preventing `tvquran.com`/Slack/BBC CORS playback errors and SSR hydration warnings. Supports `srcset`/`<picture>` (`currentSrc`), CSS `background-image`, `<canvas>`, `<svg>`, Shadow DOM, and nested `<iframe>` (`all_frames: true`).
- **Offline Self-Control Vault & OS Policy Hardening:** Commitment Time-Lock cooldown, offline `PBKDF2-SHA-256` Partner PIN, and Enterprise Policy generators (`ExtensionInstallForcelist`).

## Quick Start

```bash
npm install
npm run build
npm test
```

Load `apps/extension/dist/chrome` via `chrome://extensions` (**Developer mode** → **Load unpacked**), or `apps/extension/dist/firefox/manifest.json` via `about:debugging`.

## License

Licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)** — see [`LICENSE`](LICENSE) and [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
