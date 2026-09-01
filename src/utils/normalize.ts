/**
 * CPU-name normalization and matching.
 *
 * The same `normalizeForMatch` function is applied to both the user's query and
 * every PassMark database name, so that superficial differences (trademark
 * symbols, extra whitespace, the words "Processor"/"CPU", punctuation) never
 * cause a mismatch — while genuinely different model numbers still differ.
 */

import { decodeEntities } from './entities';

/** Words that carry no identifying value and only add noise. */
const FILLER = new Set([
  'processor',
  'processors',
  'cpu',
  'with',
  'radeon',
  'graphics',
  'vega',
  'mobile',
  'desktop',
  'series',
  'octacore',
  'hexacore',
  'quadcore',
  'dualcore',
  'core', // note: preserved specially for "Core i" / "Core Ultra", handled below
]);

/**
 * Produce a canonical token string for matching.
 * Keeps alphanumerics (and '+' for parts like "Max+"), lowercases, and drops
 * filler words — but never rewrites model numbers.
 */
export function normalizeForMatch(input: string): string {
  if (!input) return '';
  let s = decodeEntities(input).toLowerCase();

  // Strip trademark / registered / copyright marks and similar.
  s = s.replace(/[™®©℠]/g, ' ');

  // Normalise separators to spaces but keep '+' (e.g. "max+") and internal
  // hyphens between alphanumerics collapse to space so "i7-13700k" == "i7 13700k".
  s = s.replace(/[^a-z0-9+]+/g, ' ');

  const rawTokens = s.split(/\s+/).filter(Boolean);
  const tokens: string[] = [];
  for (let i = 0; i < rawTokens.length; i++) {
    const t = rawTokens[i];
    // Preserve "core" only when part of "core i<n>" or "core ultra".
    if (t === 'core') {
      const next = rawTokens[i + 1] || '';
      if (/^i\d/.test(next) || next === 'ultra' || next === 'm' || next === '2') {
        tokens.push(t);
      }
      continue;
    }
    if (FILLER.has(t)) continue;
    tokens.push(t);
  }
  return tokens.join(' ');
}

/** Tokenize a normalized string. */
export function tokenize(normalized: string): string[] {
  return normalized.split(/\s+/).filter(Boolean);
}

/** A token that contains at least one digit — the distinctive model number. */
export function hasDigit(token: string): boolean {
  return /\d/.test(token);
}

/** Detect the CPU vendor from a normalized string, if obvious. */
export function detectVendor(normalized: string): string | null {
  if (/\bamd\b|\bryzen\b|\bepyc\b|\bthreadripper\b|\bathlon\b/.test(normalized)) return 'amd';
  if (/\bintel\b|\bcore\b|\bxeon\b|\bpentium\b|\bceleron\b/.test(normalized)) return 'intel';
  if (/\bapple\b|\bm[1-9]\b/.test(normalized)) return 'apple';
  if (/\bsnapdragon\b|\bqualcomm\b|\boryon\b/.test(normalized)) return 'qualcomm';
  return null;
}

/** Sørensen–Dice coefficient over two token sets. */
export function diceCoefficient(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Map<string, number>();
  for (const t of b) setB.set(t, (setB.get(t) || 0) + 1);
  let intersection = 0;
  for (const t of a) {
    const count = setB.get(t) || 0;
    if (count > 0) {
      intersection++;
      setB.set(t, count - 1);
    }
  }
  return (2 * intersection) / (a.length + b.length);
}

export interface ScoredEntry<T> {
  entry: T;
  score: number;
}

/**
 * Score a set of candidate CPU names against a query.
 *
 * The score blends token overlap (Dice) with a strong requirement that the
 * distinctive numeric model token matches — this prevents e.g. "Ryzen 7 5800X"
 * from being offered when the user selected "Ryzen 7 7800X".
 */
export function scoreCandidates<T extends { normalizedName: string }>(
  query: string,
  entries: T[],
  options: { minScore?: number; limit?: number } = {},
): ScoredEntry<T>[] {
  const minScore = options.minScore ?? 0.34;
  const limit = options.limit ?? 8;

  const qNorm = query;
  const qTokens = tokenize(qNorm);
  if (qTokens.length === 0) return [];
  const qVendor = detectVendor(qNorm);
  const qDigitTokens = qTokens.filter(hasDigit);

  const scored: ScoredEntry<T>[] = [];
  for (const entry of entries) {
    const cTokens = tokenize(entry.normalizedName);
    if (cTokens.length === 0) continue;

    // Vendor gate: if we know the query's vendor, require the candidate to
    // share it (when the candidate's vendor is also detectable).
    if (qVendor) {
      const cVendor = detectVendor(entry.normalizedName);
      if (cVendor && cVendor !== qVendor) continue;
    }

    let score = diceCoefficient(qTokens, cTokens);

    // Reward matching numeric model tokens; penalise when the query has a
    // model number that the candidate lacks entirely.
    if (qDigitTokens.length > 0) {
      const cDigitSet = new Set(cTokens.filter(hasDigit));
      const shared = qDigitTokens.filter((t) => cDigitSet.has(t)).length;
      if (shared > 0) {
        score += 0.15 * (shared / qDigitTokens.length);
      } else {
        score -= 0.2;
      }
    }

    if (score >= minScore) {
      scored.push({ entry, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
