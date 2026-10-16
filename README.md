# CPU & GPU Benchmark Collector

[![Support me on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/balazs555)

A Manifest V3 extension for Chrome and Safari for quickly checking and comparing **PassMark** scores while
browsing — **CPU Mark** for processors and **G3D Mark** for graphics cards. Highlight a CPU
or GPU model anywhere, and its benchmark appears **inline** — no new tab.

> This is the combined **CPU + GPU** build. The separate CPU-only extension (in the
> `benchmark` folder) remains as a fallback.

> **Single source of truth:** the only benchmark databases used are PassMark
> [CPU Mark](https://www.cpubenchmark.net/) and PassMark
> [G3D Mark](https://www.videocardbenchmark.net/). Scores are read verbatim from PassMark and
> are **never estimated**. Geekbench, 3DMark, Cinebench, UserBenchmark and Notebookcheck are
> never used.

---

## Features

- **Select-to-check** for both CPUs and GPUs. The extension auto-detects which one you
  selected (e.g. `AMD Ryzen 7 7800X3D` → CPU, `GeForce RTX 4080 SUPER` → GPU).
- **Strict recognition** — the in-page button only appears for real CPU/GPU model names, so
  unrelated selections (`26ADR10`, `16GB DDR5`, `1920x1080`) are ignored.
- **Inline result card** with the primary score (CPU Mark / G3D Mark), a secondary metric
  (Single Thread / G2D Mark), the PassMark rank, and a **PassMark ↗** link to the exact
  detail page for double-checking.
- **Right-click menu** — separate “Check CPU Benchmark” and “Check GPU Benchmark” entries.
- **Manual search** with an **Auto / CPU / GPU** toggle.
- **Robust matching** — strips trademark symbols, “Processor/Graphics Card”, clock speeds and
  surrounding listing text. No confident match ⇒ it shows candidates and asks you to choose;
  it never silently substitutes a different device.
- **Separate CPU & GPU comparison lists** — each sorted by its own metric, with % difference
  vs the fastest in that group and a horizontal bar chart. (CPU Mark and G3D Mark are
  different metrics and are never compared across groups.)
- **Local caching** via `chrome.storage.local` with a configurable duration (default 24h) and
  a manual **Refresh** on every device.
- **Future-proof** — each PassMark *mega list* is downloaded once and searched locally, so
  newly released CPUs/GPUs are found without an extension update.

## How it works

Both PassMark sites expose their full list as one JSON document
(`https://www.cpubenchmark.net/data/` and `https://www.videocardbenchmark.net/data/`). The
extension warms a session cookie, downloads each list once in the background, trims it to the
fields it needs, caches it, and resolves all lookups locally. Those JSON endpoints only answer
with the session cookie, which Safari doesn't keep for extension requests, so when they come
back empty the extension falls back to the public list pages (`/cpu-list/all/`,
`/gpu_list.php`) and reads Single Thread / G2D Mark from the device's detail page once it is
resolved. Multi-socket server CPUs show their single-CPU score in that mode. Per-device-type differences
(URLs, endpoints, field names, metric labels) live entirely in
[`src/services/domains.ts`](src/services/domains.ts); the fetch/match logic in
[`src/services/passmark.ts`](src/services/passmark.ts) is shared.

## Data stored per device

```jsonc
{
  "deviceName": "GeForce RTX 4080 SUPER",
  "normalizedName": "geforce rtx 4080 super",
  "type": "gpu",
  "primaryMark": 34910,        // G3D Mark (CPU Mark for CPUs)
  "primaryLabel": "G3D Mark",
  "secondaryMark": 1155,       // G2D Mark (Single Thread for CPUs)
  "secondaryLabel": "G2D Mark",
  "rank": 8,
  "source": "PassMark",
  "sourceUrl": "https://www.videocardbenchmark.net/gpu.php?gpu=...",
  "retrievedAt": 1788240000000
}
```

The primary comparison metric is **`primaryMark`** (CPU Mark or G3D Mark).

## Project structure

```
src/
  background/   service worker: two context menus + message router
  content/      in-page selection button and result card (shadow DOM)
  popup/        popup UI: Auto/CPU/GPU search, saved, comparison, settings
  options/      options page
  services/     domains.ts (per-type config) + passmark.ts (shared lookup)
  storage/      chrome.storage.local wrappers (per-type indexes & lists)
  utils/        extraction (CPU + GPU patterns), normalization, formatting, …
  types.ts
scripts/        build.mjs, gen-icons.mjs
manifest.json
```

## Build

Requirements: **Node 18+**.

```bash
npm install
npm run build
```

Then load `dist/` via `chrome://extensions` → Developer mode → **Load unpacked**.

For the Chrome Web Store, zip the **contents** of `dist/` (so `manifest.json` sits at the zip
root) and upload that zip.

## Safari (macOS)

Requirements: **Xcode** (macOS 12+, Safari 15.4+).

The Safari version lives in [`safari/`](safari/) — an Xcode project generated with
`xcrun safari-web-extension-converter`. It **references the files in `dist/`** rather than
copying them, so Chrome and Safari always ship the same build:

```bash
npm run build
open "safari/Benchmark Collector/Benchmark Collector.xcodeproj"
```

In Xcode, select your team under **Signing & Capabilities** for both targets
(`Benchmark Collector` and `Benchmark Collector Extension`), then **Run**. Turn the extension
on in Safari → Settings → Extensions and allow it on websites (it needs
`cpubenchmark.net` / `videocardbenchmark.net` access to fetch scores).

An unsigned (“Sign to Run Locally”) build only loads after enabling Safari → Develop →
**Allow Unsigned Extensions**, which resets each time Safari quits. Publishing to the Mac App
Store requires an Apple Developer Program membership (Product → Archive in Xcode).

## Support

If this extension saves you time, you can buy me a coffee on
[Ko-fi](https://ko-fi.com/balazs555) ☕ — the link is also in the popup's bottom-right corner.

## Permissions

| Permission | Why |
| --- | --- |
| `storage` | Cache results and the PassMark lists locally |
| `contextMenus` | The “Check CPU/GPU Benchmark” right-click entries |
| `host_permissions: cpubenchmark.net, videocardbenchmark.net` | Fetch PassMark scores in the background |
| `content_scripts: <all_urls>` | Show the selection button / result card on the page you're reading |

No `tabs`, `history` or analytics permissions are requested. Only the model you look up is
sent to PassMark — never page contents.

## License

MIT
