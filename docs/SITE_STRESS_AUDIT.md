# Real-World Site Stress Audit Report

Executed with unpacked MV3 `dist/chrome` on Chromium (`--headless=new`).

| Scenario | Images Checked | Avg Inference Latency | Zero-Flash | DOM / CORS Safe | Wall Time | Notes |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **YouTube-Style Feed (Shadow DOM + Video + Recycle)** | 21 | 468.8 ms | PASS | PASS | 13958 ms | 9 open-Shadow cards + 3 recycled thumbs + autoplay WebM |
| **E-Commerce Grid (Lazy data-src + <picture> + Carousel + SSR)** | 5 | 620.5 ms | PASS | PASS | 633 ms | 0 SSR attribute mutations; lazy GIF->PNG swapped cleanly |
| **News Portal (SVG + Cross-Origin Iframe + No-CORS Media)** | 4 | 1354 ms | PASS | PASS | 780 ms | all_frames closed Shadow DOM + zero CORS playback breakage |
| **Virtualized Infinite Scroll (72 cards injected, 48 pruned)** | 72 | 1011.9 ms | PASS | PASS | 1664 ms | Pruned top cards cleaned without orphan overlay leaks |
| **SPA Client Router (pushState + Mid-Flight Src Race)** | 3 | 946.5 ms | PASS | PASS | 928 ms | Stale slow-old.png responses suppressed by monotonic requestSeq |
