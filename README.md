# Ghadhul Bashar (`غض البصر`)

> **Fast, 100% On-Device Surgical AI Gaze-Protection Platform (`v1.1.0`)** — Open Source (`AGPL-3.0`)

- **Landing Page & Interactive Demo:** https://ridloabelian.github.io/ghadhul-bashar/
- **Downloads (`v1.1.0` Chrome & Firefox ZIPs):** https://github.com/ridloabelian/ghadhul-bashar/releases/tag/v1.1.0

Ghadhul Bashar (`ghadhul-bashar`) is built from scratch to solve the architectural, accuracy, privacy, and performance bottlenecks of legacy gaze-protection tools (`HaramBlur`, `NoHaram`, `SafeGaze`, `Porda AI`, `Tahir`, and `NSFW Filter`).

## Key Capabilities

- **Smart Surgical Masking (Closed Shadow DOM):** Masks *only* detected faces, exposed *awrah* body regions, and inappropriate areas (`surgical-frosted`, `surgical-ambient`, or `surgical-pixelate`) so surrounding slides, code tutorials, and product descriptions stay 100% sharp. Automatically escalates to full cover on high NSFW probability.
- **Deterministic Zero-Flash Shield (`0 ms`):** Covers incoming media with a smooth frosted shimmer from DOM discovery until AI classification resolves — never flashing unverified pixels or self-unblurring after an arbitrary timeout.
- **4-Stage Adaptive XNNPACK ONNX Cascade (`WebGPU` + `WASM SIMD`):**
  - **Stage 0 (`VisualSignalProfiler`, `< 1 ms`):** Single-pass `64×64` RGBA probe skips non-organic UI/banners and detects photographic skin, anime pastel flesh, grayscale photos, and B&W manga screentones.
  - **Stage 1 (`YuNet 2023mar`, `0.23 MB`):** Catches small, angled, and crowded faces (up to 16 faces per frame).
  - **Stage 2–3 (`NudeNet-320n FP16` `6.12 MB` + `Intel AGR0013` `4.29 MB`):** Evaluates 18 body-part classes + continuous age estimation (**automatically exempts children `< 10` years**) + gender logit-fusion.
  - **Stage 4 (`Marqo ViT-Tiny NSFW` `11.34 MB`, conditional):** Invoked selectively only on ambiguous high-skin close-ups, borderline detections, illustrations, or B&W manga.
- **64-bit Perceptual `dHash` + Two-Tier Cache (`< 0.1 ms`):** Resized or re-signed CDN images resolve instantly without re-running ONNX.
- **60 FPS Video Guard & 16×16 Luma Scene-Cut Shield:** Viewport-gated `requestVideoFrameCallback` loop with Kalman/IoU tracking + instant scene-cut shield + optional **Auto-Mute on Blur** (`0%` CPU on hidden tabs or off-screen videos).
- **Zero-Breakage Web Compatibility:** Never mutates `crossorigin`, `width`, `height`, or React/Next.js hydrated attributes — preventing `tvquran.com`/Slack/BBC CORS playback errors and SSR hydration warnings. Supports `srcset`/`<picture>` (`currentSrc`), CSS `background-image`, `<canvas>`, `<svg>`, Shadow DOM, virtualized infinite scroll, SPA routers (`requestSeq`), and nested `<iframe>` (`all_frames: true`).
- **Full Options UI, Safe JSON Export/Import & Offline Self-Control Vault:** Granular Fiqh toggles, live surgical preview, subdomain-aware whitelist, Commitment Time-Lock cooldown, offline `PBKDF2-SHA-256` Partner PIN, and Enterprise Policy generators (`ExtensionInstallForcelist`).

## Quick Start

```bash
npm install
npm run typecheck
npm test
npm run zip
```

Verification, Benchmarks & Store Documentation:
- `npm run benchmark` — Adaptive Cascade vs Legacy Full ONNX WASM benchmark (`docs/BENCHMARK.md`).
- `npm run test:e2e` — Real Chromium MV3 E2E suite (Closed Shadow DOM, zero CORS breakage, dHash cache, Options & Time-Lock).
- `npm run audit:sites` — 5-layout real-world site stress audit (`docs/SITE_STRESS_AUDIT.md`).
- [`PRIVACY.md`](PRIVACY.md) & [`docs/STORE_RELEASE_GUIDE.md`](docs/STORE_RELEASE_GUIDE.md) — Chrome Web Store & Firefox AMO submission package guide.
- [`apps/ghadhulbashar/`](apps/ghadhulbashar/index.html) — Lightweight zero-dependency static landing page with interactive Surgical Mask demo.

Load `apps/extension/dist/chrome` via `chrome://extensions` (**Developer mode** → **Load unpacked**), or `apps/extension/dist/firefox/manifest.json` via `about:debugging`.

## License

Licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)** — see [`LICENSE`](LICENSE) and [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
