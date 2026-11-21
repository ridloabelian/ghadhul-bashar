# Adaptive Cascade Benchmark (Phase 2 — WASM XNNPACK)

Measured inside real Chromium (`--headless=new`) on this 2-vCPU Linux host (`backend=wasm`) across a 24-image synthetic corpus (6 web media categories).

## Overall Comparison (Before vs After)

| Metric | Legacy Full Cascade (`v1.0.0`) | Adaptive 4-Stage Cascade (`v1.1.0`) | Improvement |
| :--- | :---: | :---: | :---: |
| **Mean Latency** | 1032.6 ms | **137.4 ms** | **7.51× faster** |
| **Median (P50)** | 857.1 ms | **29.4 ms** | 29.15× |
| **P95 Latency** | 2124.6 ms | **641.4 ms** | 3.31× |
| **Marqo ViT-Tiny Invocations** | 24 / 24 (100.0%) | **4 / 24 (16.7%)** | Conditional gating |

## Per-Category Breakdown

| Category | Images | Legacy Mean | Adaptive Mean | Speedup | Stages Executed |
| :--- | :---: | :---: | :---: | :---: | :--- |
| `ui-banner` | 4 | 2357.7 ms | **7.1 ms** | 332.07× | `signal-skip` |
| `product-landscape` | 6 | 873.8 ms | **23.0 ms** | 38.05× | `yunet` |
| `clothed-headshot` | 6 | 794.4 ms | **27.0 ms** | 29.46× | `yunet, age-gender` |
| `exposed-body` | 4 | 662.3 ms | **136.6 ms** | 4.85× | `yunet, nudenet, age-gender` |
| `anime-illustration` | 2 | 674.8 ms | **557.5 ms** | 1.21× | `yunet, marqo-nsfw` |
| `bw-manga` | 2 | 672.3 ms | **654.6 ms** | 1.03× | `yunet, nudenet, marqo-nsfw` |
