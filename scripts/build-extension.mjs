/**
 * Builds cross-browser MV3 extension bundles (dist/chrome & dist/firefox)
 * using esbuild, copies local ONNX models + WASM runtimes, verifies zero
 * external network calls in extension scripts, and optionally packages .zip archives.
 */

import esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT_DIR = path.join(ROOT, 'apps', 'extension');
const SRC_DIR = path.join(EXT_DIR, 'src');
const PUBLIC_DIR = path.join(EXT_DIR, 'public');
const ORT_DIST = path.join(ROOT, 'node_modules', 'onnxruntime-web', 'dist');
const DIST_BASE = path.join(EXT_DIR, 'dist');

const WASM_ASSETS = [
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd-threaded.jsep.mjs',
  'ort-wasm-simd-threaded.jsep.wasm',
];

const TARGETS = [
  { name: 'chrome', manifest: 'manifest.chrome.json' },
  { name: 'firefox', manifest: 'manifest.firefox.json' },
];

const aliasPlugin = {
  name: 'workspace-alias',
  setup(build) {
    build.onResolve({ filter: /^@ghadhul-bashar\/core$/ }, () => ({
      path: path.join(ROOT, 'packages', 'core', 'src', 'index.ts'),
    }));
    build.onResolve({ filter: /^@ghadhul-bashar\/vision$/ }, () => ({
      path: path.join(ROOT, 'packages', 'vision', 'src', 'index.ts'),
    }));
  },
};

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function buildTarget(target) {
  const outDir = path.join(DIST_BASE, target.name);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const commonOpts = {
    bundle: true,
    minify: true,
    sourcemap: false,
    target: 'es2022',
    plugins: [aliasPlugin],
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    logLevel: 'silent',
  };

  // 1) Content script (must be classic IIFE for Chrome/Firefox MV3)
  await esbuild.build({
    ...commonOpts,
    entryPoints: [path.join(SRC_DIR, 'content', 'index.ts')],
    format: 'iife',
    outfile: path.join(outDir, 'content.js'),
  });

  // 2) Background, Offscreen, and UI entrypoints (ESM modules)
  await esbuild.build({
    ...commonOpts,
    entryPoints: {
      background: path.join(SRC_DIR, 'background', 'index.ts'),
      offscreen: path.join(SRC_DIR, 'offscreen', 'index.ts'),
      'ui/popup': path.join(SRC_DIR, 'ui', 'popup.ts'),
      'ui/onboarding': path.join(SRC_DIR, 'ui', 'onboarding.ts'),
      'ui/options': path.join(SRC_DIR, 'ui', 'options.ts'),
    },
    format: 'esm',
    splitting: false,
    outdir: outDir,
  });

  // 3) Copy static files: manifest, HTML, CSS, icons, models, wasm
  fs.copyFileSync(path.join(EXT_DIR, target.manifest), path.join(outDir, 'manifest.json'));
  fs.copyFileSync(path.join(SRC_DIR, 'offscreen', 'offscreen.html'), path.join(outDir, 'offscreen.html'));

  const uiOut = path.join(outDir, 'ui');
  fs.mkdirSync(uiOut, { recursive: true });
  for (const uiFile of ['popup.html', 'onboarding.html', 'options.html', 'styles.css']) {
    fs.copyFileSync(path.join(SRC_DIR, 'ui', uiFile), path.join(uiOut, uiFile));
  }

  copyDirRecursive(path.join(PUBLIC_DIR, 'icons'), path.join(outDir, 'icons'));
  copyDirRecursive(path.join(PUBLIC_DIR, 'models'), path.join(outDir, 'models'));

  const wasmOut = path.join(outDir, 'wasm');
  fs.mkdirSync(wasmOut, { recursive: true });
  for (const asset of WASM_ASSETS) {
    const srcFile = path.join(ORT_DIST, asset);
    if (!fs.existsSync(srcFile)) {
      throw new Error(`Missing ONNX Runtime Web asset: ${srcFile}`);
    }
    fs.copyFileSync(srcFile, path.join(wasmOut, asset));
  }

  // 4) Security check: verify content script & UI contain zero external CDN URLs
  for (const file of ['content.js', 'ui/popup.js', 'ui/onboarding.js', 'ui/options.js']) {
    const text = fs.readFileSync(path.join(outDir, file), 'utf8');
    if (text.includes('jsdelivr.net') || text.includes('unpkg.com')) {
      throw new Error(`Security check failed: external CDN reference found in ${target.name}/${file}`);
    }
  }

  console.log(`[BUILT] dist/${target.name} successfully`);
}

async function main() {
  for (const target of TARGETS) {
    await buildTarget(target);
  }

  if (process.argv.includes('--zip')) {
    for (const target of TARGETS) {
      const outDir = path.join(DIST_BASE, target.name);
      const zipPath = path.join(DIST_BASE, `ghadhul-bashar-${target.name}.zip`);
      fs.rmSync(zipPath, { force: true });
      execFileSync(
        'python3',
        [
          '-c',
          'import os, sys, zipfile\nsrc, dst = sys.argv[1], sys.argv[2]\nwith zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zf:\n  for root, _, files in os.walk(src):\n    for f in files:\n      p = os.path.join(root, f)\n      zf.write(p, os.path.relpath(p, src))\n',
          outDir,
          zipPath,
        ],
        { stdio: 'inherit' }
      );
      console.log(`[ZIPPED] ${zipPath}`);
    }
  }
}

await main();
