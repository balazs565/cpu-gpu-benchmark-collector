/**
 * Per-device-type PassMark configuration.
 *
 * Everything site-specific for each database (URLs, endpoints, field names,
 * metric labels) lives here, so adding/adjusting a source is a one-place change.
 */

import type { DeviceType, PassMarkRawEntry } from '../types';
import { parsePassMarkNumber } from '../utils/format';

export interface DomainConfig {
  type: DeviceType;
  /** Short label, e.g. "CPU" / "GPU". */
  label: string;
  baseUrl: string;
  /** Page loaded first so the PHPSESSID cookie is set. */
  warmupUrl: string;
  /** Data endpoints tried in order. */
  dataEndpoints: string[];
  /**
   * Public list page used when the data endpoints come back empty (they need
   * the PHPSESSID cookie, which Safari doesn't keep for extension requests).
   */
  listUrl: string;
  /**
   * One list-page row: id, URL-encoded name (from the link — the link text can
   * be mangled by Cloudflare's email obfuscation), primary mark, rank.
   */
  listRow: RegExp;
  /** The secondary score on a device detail page (list pages don't carry it). */
  detailSecondary: RegExp;
  /** Build a detail-page URL from a raw href fragment (already entity-decoded). */
  detailPath: (fragment: string) => string;
  primaryLabel: string; // "CPU Mark" | "G3D Mark"
  secondaryLabel: string; // "Single Thread" | "G2D Mark"
  /** Extract the primary score from a raw row. */
  primary: (raw: PassMarkRawEntry) => number | null;
  /** Extract the secondary score from a raw row. */
  secondary: (raw: PassMarkRawEntry) => number | null;
}

export const DOMAINS: Record<DeviceType, DomainConfig> = {
  cpu: {
    type: 'cpu',
    label: 'CPU',
    baseUrl: 'https://www.cpubenchmark.net/',
    warmupUrl: 'https://www.cpubenchmark.net/CPU_mega_page.html',
    dataEndpoints: ['https://www.cpubenchmark.net/data/', 'https://www.cpubenchmark.net/data/cpu_data.json'],
    listUrl: 'https://www.cpubenchmark.net/cpu-list/all/',
    listRow: /<tr id="cpu(\d+)"><td><a href="[^"]*?\?cpu=([^"&]*)&amp;id=\d+">.*?<\/a><\/td><td>([^<]*)<\/td><td>([^<]*)<\/td>/g,
    detailSecondary: /Single Thread Rating<\/div>\s*<div[^>]*>([\d,]+)</,
    detailPath: (f) => `https://www.cpubenchmark.net/cpu.php?cpu=${f}`,
    primaryLabel: 'CPU Mark',
    secondaryLabel: 'Single Thread',
    primary: (r) => parsePassMarkNumber(r.cpumark),
    secondary: (r) => parsePassMarkNumber(r.thread),
  },
  gpu: {
    type: 'gpu',
    label: 'GPU',
    baseUrl: 'https://www.videocardbenchmark.net/',
    warmupUrl: 'https://www.videocardbenchmark.net/GPU_mega_page.html',
    dataEndpoints: ['https://www.videocardbenchmark.net/data/'],
    listUrl: 'https://www.videocardbenchmark.net/gpu_list.php',
    listRow: /<tr id="gpu(\d+)"><td><a href="[^"]*?\?gpu=([^"&]*)&amp;id=\d+">.*?<\/a><\/td><td>([^<]*)<\/td><td>([^<]*)<\/td>/gi,
    detailSecondary: /Average G2D Mark:<\/strong>\s*([\d,]+)/,
    detailPath: (f) => `https://www.videocardbenchmark.net/gpu.php?gpu=${f}`,
    primaryLabel: 'G3D Mark',
    secondaryLabel: 'G2D Mark',
    primary: (r) => parsePassMarkNumber(r.g3d),
    secondary: (r) => parsePassMarkNumber(r.g2d),
  },
};

export const DEVICE_TYPES: DeviceType[] = ['cpu', 'gpu'];
