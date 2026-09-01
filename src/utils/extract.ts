/**
 * Extract the most likely CPU or GPU model from arbitrary selected text, and
 * decide which PassMark database it belongs to.
 *
 * Recognition is strict by default: a value is only returned when the text
 * contains a recognised brand/series anchor (AMD Ryzen, Intel Core/Xeon,
 * NVIDIA GeForce RTX/GTX, AMD Radeon RX, Intel Arc, …). This keeps the in-page
 * "Check Benchmark" button from appearing on unrelated strings such as
 * "26ADR10", "16GB DDR5" or "1920x1080".
 *
 * A permissive `looseModel` path is used only for explicit user actions
 * (manual search / right-click), where intent is unambiguous.
 */

import { decodeEntities } from './entities';
import type { DeviceType } from '../types';

/* ------------------------------ CPU patterns ----------------------------- */
const CPU_PATTERNS: RegExp[] = [
  /\b(?:AMD\s+)?Ryzen\s+AI\s+(?:Max\+?\s+)?(?:PRO\s+)?\d+\s+(?:HX?\s+|PRO\s+)?\d+\w*/i,
  /\b(?:AMD\s+)?Ryzen\s+Threadripper(?:\s+PRO)?\s+\d+\w*/i,
  /\b(?:AMD\s+)?Ryzen\s+(?:PRO\s+)?\d\s+\d{3,4}\w*/i,
  /\b(?:AMD\s+)?EPYC\s+\d+\w*/i,
  /\b(?:AMD\s+)?Athlon[\w\s-]*?\d+\w*/i,
  /\bAMD\s+A\d{1,2}[- ]?\d{3,4}\w*(?:\s+APU)?/i,
  /\b(?:Intel\s+)?Core\s+Ultra\s+\d\s+\d{3}\w*/i,
  /\b(?:Intel\s+)?Core\s+i\d[- ]?\d{3,5}\w*/i,
  // New Intel "Core 5/7/…" naming (no "i", no "Ultra") — e.g. "Core 5 210H", "Core 7 240H"
  /\b(?:Intel\s+)?Core\s+\d\s+\d{2,4}\w*/i,
  // Bare "Ultra 7 265KF" (no "Core") — vendor/series is filled in by addCpuVendor
  /\bUltra\s+\d\s+\d{3}\w*/i,
  /\bi[3579][- ]\d{3,5}\w*\b/i,
  /\b(?:Intel\s+)?Xeon\b[\w\s+-]*?\d{3,5}\w*/i,
  /\b(?:Intel\s+)?(?:Pentium|Celeron)[\w\s-]*?\d+\w*/i,
  /\bIntel\s+(?:Processor\s+)?N\d{2,4}\b/i,
  /\bApple\s+M\d(?:\s+(?:Pro|Max|Ultra))?/i,
  /\bM\d\s+(?:Pro|Max|Ultra)\b/i,
  /\bSnapdragon\s+X\s+(?:Elite|Plus)[\w\s-]*/i,
];

/* ------------------------------ GPU patterns ----------------------------- */
const GPU_PATTERNS: RegExp[] = [
  // NVIDIA GeForce RTX — "GeForce RTX 4070 Ti SUPER", "RTX 4090", "RTX 5080"
  /\b(?:NVIDIA\s+)?(?:GeForce\s+)?RTX\s*\d{3,4}\s*(?:Ti\s*SUPER|Ti|SUPER|Ada)?\w*/i,
  // NVIDIA GeForce GTX — "GTX 1660 SUPER", "GeForce GTX 1080 Ti"
  /\b(?:NVIDIA\s+)?(?:GeForce\s+)?GTX\s*\d{3,4}\s*(?:Ti|SUPER)?\w*/i,
  // NVIDIA workstation / data-center — "RTX A6000", "RTX 6000 Ada", "Quadro RTX 8000", "Tesla T4", "A100", "H100"
  /\b(?:NVIDIA\s+)?RTX\s+A\d{3,4}\w*/i,
  /\b(?:NVIDIA\s+)?Quadro\s+[\w\s-]*?\d+\w*/i,
  /\b(?:NVIDIA\s+)?Tesla\s+[A-Z]?\d+\w*/i,
  /\b(?:NVIDIA\s+)?TITAN\s+\w+/i,
  // AMD Radeon RX — "Radeon RX 7900 XTX", "RX 6700 XT", "Radeon RX 9070"
  /\b(?:AMD\s+)?Radeon\s+RX\s*\d{3,4}\s*(?:XTX|XT|GRE|M|S)?\w*/i,
  /\bRX\s*\d{3,4}\s*(?:XTX|XT|GRE)?\b/i,
  // AMD Radeon Pro / Vega / integrated — "Radeon Pro W7900", "Radeon Vega 8", "Radeon 780M"
  /\b(?:AMD\s+)?Radeon\s+(?:Pro\s+)?(?:Vega\s+)?\w*\d+\w*/i,
  // Intel Arc — "Arc A770", "Intel Arc B580"
  /\b(?:Intel\s+)?Arc\s+[AB]\d{3}\w*/i,
];

const TRAILING_NOISE = /\b(?:up\s+to|@|,|\(|—|–|-\s).*/i;

export function cleanSelection(raw: string): string {
  return decodeEntities(raw)
    .replace(/[™®©℠]/g, ' ')
    // Strip filler words that vendors insert between series and model number.
    .replace(/\b(?:processors?|cpu|graphics\s+card|graphics|videocard|video\s+card|gpu)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const p of patterns) {
    const m = text.match(p);
    if (m && m[0]) return m[0].replace(/\s+/g, ' ').trim();
  }
  return null;
}

/**
 * Prepend the manufacturer to a bare CPU model when it is missing, so the query
 * matches PassMark's naming (which is vendor-prefixed, e.g. "AMD Ryzen 7 8745HX",
 * "Intel Core Ultra 7 265KF"). GPU names on PassMark are NOT vendor-prefixed, so
 * this is applied to CPUs only.
 */
export function addCpuVendor(model: string): string {
  const m = model.trim();
  if (/^(amd|intel|apple|qualcomm)\b/i.test(m)) return m; // already has a vendor
  if (/^(ryzen|epyc|threadripper|athlon)\b/i.test(m)) return `AMD ${m}`;
  if (/^core\b/i.test(m)) return `Intel ${m}`; // Core i7 / Core Ultra / Core 5
  if (/^ultra\b/i.test(m)) return `Intel Core ${m}`; // "Ultra 7 265KF"
  if (/^i[3579][- ]\d/i.test(m)) return `Intel Core ${m}`; // "i7-13700K"
  if (/^(xeon|pentium|celeron)\b/i.test(m)) return `Intel ${m}`;
  return m;
}

/** Strict CPU extraction (recognised anchor required), with vendor normalised. */
export function extractCpuModel(raw: string): string | null {
  const cleaned = cleanSelection(raw);
  if (!cleaned) return null;
  const match = firstMatch(cleaned, CPU_PATTERNS);
  return match ? addCpuVendor(match) : null;
}

/** Strict GPU extraction (recognised anchor required). */
export function extractGpuModel(raw: string): string | null {
  const cleaned = cleanSelection(raw);
  return cleaned ? firstMatch(cleaned, GPU_PATTERNS) : null;
}

export interface DetectedDevice {
  type: DeviceType;
  model: string;
}

/**
 * Strictly detect whether the text is a GPU or a CPU, and extract the model.
 * GPUs are tested first (their anchors — RTX/GTX/Radeon RX/Arc — are highly
 * distinctive and never collide with CPU anchors). Returns null when neither
 * matches, which is what gates the in-page selection button.
 */
export function detectDevice(raw: string): DetectedDevice | null {
  const gpu = extractGpuModel(raw);
  if (gpu) return { type: 'gpu', model: gpu };
  const cpu = extractCpuModel(raw);
  if (cpu) return { type: 'cpu', model: cpu };
  return null;
}

/**
 * Permissive extraction for a *known* device type (explicit user action).
 * Falls back to any short, model-like string when the strict extractor misses.
 */
export function looseModel(raw: string, type: DeviceType): string | null {
  const strict = type === 'gpu' ? extractGpuModel(raw) : extractCpuModel(raw);
  if (strict) return strict;

  const cleaned = cleanSelection(raw);
  const trimmed = cleaned.replace(TRAILING_NOISE, '').trim();
  const looksLikeModel =
    trimmed.length > 0 &&
    trimmed.length <= 60 &&
    /\d/.test(trimmed) &&
    trimmed.split(/\s+/).length <= 8;
  return looksLikeModel ? trimmed : null;
}
