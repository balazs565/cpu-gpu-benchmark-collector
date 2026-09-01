/**
 * Shared domain types for CPU & GPU Benchmark Collector.
 *
 * The single benchmark source is PassMark:
 *   - CPUs: CPU Mark          (cpubenchmark.net)
 *   - GPUs: G3D Mark          (videocardbenchmark.net)
 * No other benchmark database is ever used, and scores are never estimated.
 */

export const BENCHMARK_SOURCE = 'PassMark' as const;

/** Which PassMark database a device belongs to. */
export type DeviceType = 'cpu' | 'gpu';

/** A raw entry as returned by a PassMark mega-list endpoint (CPU or GPU). */
export interface PassMarkRawEntry {
  id: string;
  name: string;
  rank: number | string;
  cat: string;
  href: string;
  // CPU fields
  cpumark?: string;
  thread?: string;
  // GPU fields
  g3d?: string;
  g2d?: string;
  output?: boolean;
}

/** A trimmed, normalized device record kept in a local PassMark index. */
export interface DeviceIndexEntry {
  id: string;
  name: string;
  normalizedName: string;
  type: DeviceType;
  /** CPU Mark (CPU) or G3D Mark (GPU). */
  primaryMark: number | null;
  /** Single Thread (CPU) or G2D Mark (GPU). */
  secondaryMark: number | null;
  rank: number | null;
  category: string;
  sourceUrl: string;
}

/**
 * A fully-resolved benchmark record. Persisted for every identified device.
 * `primaryLabel`/`secondaryLabel` carry the human names of the two metrics so
 * the UI can render CPUs and GPUs with the same code.
 */
export interface DeviceRecord {
  deviceName: string;
  normalizedName: string;
  type: DeviceType;
  primaryMark: number | null;
  primaryLabel: string; // "CPU Mark" | "G3D Mark"
  secondaryMark: number | null;
  secondaryLabel: string; // "Single Thread" | "G2D Mark"
  rank: number | null;
  source: typeof BENCHMARK_SOURCE;
  sourceUrl: string;
  /** Epoch milliseconds when this record was retrieved from PassMark. */
  retrievedAt: number;
}

/** A locally cached PassMark index (one per device type). */
export interface PassMarkIndex {
  entries: DeviceIndexEntry[];
  fetchedAt: number;
}

/** User-configurable settings. */
export interface Settings {
  cacheDurationMs: number;
  showSelectionButton: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  cacheDurationMs: 24 * 60 * 60 * 1000,
  showSelectionButton: true,
};

export type LookupStatus =
  | 'ok'
  | 'cached'
  | 'candidates'
  | 'not_found'
  | 'no_device'
  | 'passmark_unavailable'
  | 'error';

export interface LookupResult {
  status: LookupStatus;
  /** Which database this result pertains to (when known). */
  type?: DeviceType;
  /** The model string extracted from the input. */
  query?: string;
  /** Present for 'ok' and 'cached'. Carries the PassMark id for UI actions. */
  device?: DeviceRecord & { id?: string };
  stale?: boolean;
  candidates?: DeviceIndexEntry[];
  message?: string;
}
