/**
 * Builds the extension with Vite.
 *
 * Each entry (service worker, content script, popup, options) is compiled to a
 * single self-contained file with a fixed, predictable name, so manifest.json
 * can reference them directly. Static assets (manifest, icons, HTML) are copied
 * into dist afterwards.
 */
import { build } from 'vite';
import { rmSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const src = (...p) => join(ROOT, 'src', ...p);

/** Build one entry as a single IIFE file (plus one CSS file when it imports CSS). */
async function buildEntry({ entry, name, jsName, cssName }) {
  await build({
    root: ROOT,
    configFile: false,
    logLevel: 'warn',
    define: { 'process.env.NODE_ENV': '"production"' },
    build: {
      outDir: DIST,
      emptyOutDir: false,
      target: 'chrome110',
      minify: true,
      sourcemap: false,
      cssCodeSplit: false,
      lib: {
        entry,
        name,
        formats: ['iife'],
        fileName: () => jsName,
      },
      rollupOptions: {
        output: {
          assetFileNames: (info) => {
            const n = info.name || (info.names && info.names[0]) || '';
            if (n.endsWith('.css') && cssName) return cssName;
            return '[name][extname]';
          },
        },
      },
    },
  });
  console.log(`built ${jsName}`);
}

async function main() {
  // Ensure icons exist (generator is a plain script that writes on import).
  await import('./gen-icons.mjs');

  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });

  await buildEntry({
    entry: src('background', 'service-worker.ts'),
    name: 'cbcWorker',
    jsName: 'service-worker.js',
  });
  await buildEntry({
    entry: src('content', 'content.ts'),
    name: 'cbcContent',
    jsName: 'content.js',
  });
  await buildEntry({
    entry: src('popup', 'popup.ts'),
    name: 'cbcPopup',
    jsName: 'popup.js',
    cssName: 'popup.css',
  });
  await buildEntry({
    entry: src('options', 'options.ts'),
    name: 'cbcOptions',
    jsName: 'options.js',
    cssName: 'options.css',
  });

  // Static assets.
  copyFileSync(join(ROOT, 'manifest.json'), join(DIST, 'manifest.json'));
  copyFileSync(src('popup', 'popup.html'), join(DIST, 'popup.html'));
  copyFileSync(src('options', 'options.html'), join(DIST, 'options.html'));

  const iconsSrc = join(ROOT, 'public', 'icons');
  const iconsDst = join(DIST, 'icons');
  mkdirSync(iconsDst, { recursive: true });
  for (const f of readdirSync(iconsSrc)) copyFileSync(join(iconsSrc, f), join(iconsDst, f));

  console.log('\n✓ Build complete → dist/');
  console.log('  Load it via chrome://extensions → Developer mode → Load unpacked → select the dist folder.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
