/** Formatting helpers used across popup, options and the in-page card. */

/** Parse a PassMark numeric string ("24,932", "NA", "") into a number or null. */
export function parsePassMarkNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = value.replace(/,/g, '').trim();
  if (!cleaned || cleaned.toUpperCase() === 'NA') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Format an integer score with thousands separators, e.g. 24932 -> "24,932". */
export function formatScore(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return Math.round(value).toLocaleString('en-US');
}

/** Format a rank as "#757". */
export function formatRank(rank: number | null | undefined): string {
  if (rank == null || !Number.isFinite(rank)) return '—';
  return `#${Math.round(rank).toLocaleString('en-US')}`;
}

/** Human-friendly "time ago" for a retrieval timestamp. */
export function timeAgo(epochMs: number, now = Date.now()): string {
  const diff = Math.max(0, now - epochMs);
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr${hr === 1 ? '' : 's'} ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? '' : 's'} ago`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month} month${month === 1 ? '' : 's'} ago`;
  const year = Math.floor(day / 365);
  return `${year} year${year === 1 ? '' : 's'} ago`;
}

/** Absolute local date-time for tooltips. */
export function formatDateTime(epochMs: number): string {
  try {
    return new Date(epochMs).toLocaleString();
  } catch {
    return new Date(epochMs).toISOString();
  }
}

/**
 * Percentage difference of `value` relative to a reference score.
 * ((value - reference) / reference) * 100.
 */
export function percentageDifference(value: number, reference: number): number {
  if (!reference) return 0;
  return ((value - reference) / reference) * 100;
}

/** Signed, single-decimal percentage label, e.g. "-17.8%" or "0%". */
export function formatSignedPercent(pct: number): string {
  if (Math.abs(pct) < 0.05) return '0%';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}
