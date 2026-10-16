/**
 * PassMark lookup service (the ONLY benchmark source).
 *
 * Works identically for CPUs (CPU Mark, cpubenchmark.net) and GPUs (G3D Mark,
 * videocardbenchmark.net) — the differences are captured entirely in
 * `domains.ts`. Each database's full "mega list" is fetched once and cached
 * locally, so a device is never scraped twice and newly released parts appear
 * automatically on the next refresh (no extension update required).
 *
 * Scores are taken verbatim from PassMark. They are never estimated, and no
 * other benchmark database is ever consulted.
 */

import {
  type DeviceIndexEntry,
  type DeviceRecord,
  type DeviceType,
  type LookupResult,
  type PassMarkIndex,
  type PassMarkRawEntry,
  BENCHMARK_SOURCE,
} from '../types';
import { decodeEntities } from '../utils/entities';
import { parsePassMarkNumber } from '../utils/format';
import { normalizeForMatch, scoreCandidates } from '../utils/normalize';
import { detectDevice, looseModel } from '../utils/extract';
import { DOMAINS, type DomainConfig } from './domains';
import {
  getIndex,
  setIndex,
  getSettings,
  findSavedByNormalized,
  saveDevice,
} from '../storage/storage';

const FETCH_TIMEOUT_MS = 25_000;
const MIN_REFETCH_INTERVAL_MS = 60_000;

const inFlight: Partial<Record<DeviceType, Promise<PassMarkIndex | null>>> = {};
const lastFetchAttempt: Record<DeviceType, number> = { cpu: 0, gpu: 0 };

/* ----------------------------- fetch & parse ----------------------------- */

function toIndexEntry(cfg: DomainConfig, raw: PassMarkRawEntry): DeviceIndexEntry {
  const name = decodeEntities(String(raw.name ?? '')).trim();
  const fragment = decodeEntities(String(raw.href ?? '')).trim();
  return {
    id: String(raw.id),
    name,
    normalizedName: normalizeForMatch(name),
    type: cfg.type,
    primaryMark: cfg.primary(raw),
    secondaryMark: cfg.secondary(raw),
    rank: parsePassMarkRank(raw.rank),
    category: String(raw.cat ?? '').replace(/\\\//g, '/'),
    sourceUrl: fragment ? cfg.detailPath(fragment) : cfg.baseUrl,
  };
}

/** Rank can be a number, a numeric string, or "Insufficient data". */
function parsePassMarkRank(rank: number | string | undefined): number | null {
  if (typeof rank === 'number') return Number.isFinite(rank) ? rank : null;
  if (!rank) return null;
  const n = Number(String(rank).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

async function warmCookie(cfg: DomainConfig, signal: AbortSignal): Promise<void> {
  try {
    const res = await fetch(cfg.warmupUrl, {
      method: 'GET',
      signal,
      credentials: 'include',
      headers: { Accept: 'text/html,application/xhtml+xml' },
    });
    await res.text().catch(() => undefined);
  } catch {
    /* ignore */
  }
}

async function fetchJson(url: string, signal: AbortSignal): Promise<unknown> {
  const bust = url.includes('?') ? '&' : '?';
  const res = await fetch(`${url}${bust}_=${Date.now()}`, {
    method: 'GET',
    signal,
    credentials: 'include',
    headers: { Accept: 'application/json, text/javascript, */*; q=0.01', 'X-Requested-With': 'XMLHttpRequest' },
  });
  if (res.status === 429) {
    const err = new Error('rate_limited');
    (err as Error & { code?: string }).code = 'rate_limited';
    throw err;
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('malformed_response');
  }
}

/**
 * Build an index from the public list page. It needs no session cookie, but
 * carries only the primary mark and rank — see `withSecondary`.
 */
async function fetchIndexFromListPage(cfg: DomainConfig, signal: AbortSignal): Promise<PassMarkIndex> {
  const res = await fetch(cfg.listUrl, { method: 'GET', signal, headers: { Accept: 'text/html,application/xhtml+xml' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const entries: DeviceIndexEntry[] = [];
  for (const [, id, encodedName, mark, rank] of html.matchAll(cfg.listRow)) {
    const primaryMark = parsePassMarkNumber(mark);
    if (primaryMark == null) continue;
    let name: string;
    try {
      name = decodeURIComponent(encodedName.replace(/\+/g, ' ')).trim();
    } catch {
      continue;
    }
    entries.push({
      id,
      name,
      normalizedName: normalizeForMatch(name),
      type: cfg.type,
      primaryMark,
      secondaryMark: null,
      rank: parsePassMarkRank(rank),
      category: '',
      sourceUrl: cfg.detailPath(`${encodedName}&id=${id}`),
    });
  }
  if (entries.length === 0) throw new Error('malformed_response');
  return { entries, fetchedAt: Date.now(), source: 'list' };
}

async function fetchIndexFromNetwork(cfg: DomainConfig): Promise<PassMarkIndex> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    await warmCookie(cfg, controller.signal);
    for (const endpoint of cfg.dataEndpoints) {
      try {
        const json = (await fetchJson(endpoint, controller.signal)) as { data?: PassMarkRawEntry[] };
        const rows = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? (json as PassMarkRawEntry[]) : null;
        if (!rows || rows.length === 0) continue;
        const entries = rows
          .filter((r) => r && r.name != null && r.id != null)
          .map((r) => toIndexEntry(cfg, r))
          .filter((e) => e.primaryMark != null);
        if (entries.length === 0) continue;
        return { entries, fetchedAt: Date.now(), source: 'data' };
      } catch (e) {
        if ((e as Error & { code?: string }).code === 'rate_limited') throw e;
      }
    }
    // Without the session cookie the data endpoints answer `{ "data": [] }`.
    // Safari doesn't keep that cookie for extension requests.
    return await fetchIndexFromListPage(cfg, controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Entries from a list-page index have no secondary mark; read it from the
 * device's detail page. Best effort: on failure the record just shows none.
 */
async function withSecondary(cfg: DomainConfig, index: PassMarkIndex, entry: DeviceIndexEntry): Promise<DeviceIndexEntry> {
  if (index.source !== 'list' || entry.secondaryMark != null) return entry;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(entry.sourceUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'text/html,application/xhtml+xml' },
    });
    if (!res.ok) return entry;
    const match = cfg.detailSecondary.exec(await res.text());
    return match ? { ...entry, secondaryMark: parsePassMarkNumber(match[1]) } : entry;
  } catch {
    return entry;
  } finally {
    clearTimeout(timer);
  }
}

export async function ensureIndex(type: DeviceType, forceRefresh = false): Promise<PassMarkIndex | null> {
  const cfg = DOMAINS[type];
  const settings = await getSettings();
  const cached = await getIndex(type);
  const now = Date.now();
  const isStale = !cached || now - cached.fetchedAt > settings.cacheDurationMs;

  if (cached && !isStale && !forceRefresh) return cached;
  if (now - lastFetchAttempt[type] < MIN_REFETCH_INTERVAL_MS && cached) return cached;

  const existing = inFlight[type];
  if (existing) return existing;

  lastFetchAttempt[type] = now;
  const p = (async () => {
    try {
      const fresh = await fetchIndexFromNetwork(cfg);
      await setIndex(type, fresh);
      return fresh;
    } catch {
      return cached ?? null;
    } finally {
      inFlight[type] = undefined;
    }
  })();
  inFlight[type] = p;
  return p;
}

/* -------------------------------- lookup --------------------------------- */

function toRecord(cfg: DomainConfig, entry: DeviceIndexEntry, retrievedAt = Date.now()): DeviceRecord {
  return {
    deviceName: entry.name,
    normalizedName: entry.normalizedName,
    type: cfg.type,
    primaryMark: entry.primaryMark,
    primaryLabel: cfg.primaryLabel,
    secondaryMark: entry.secondaryMark,
    secondaryLabel: cfg.secondaryLabel,
    rank: entry.rank,
    source: BENCHMARK_SOURCE,
    sourceUrl: entry.sourceUrl,
    retrievedAt,
  };
}

function findExact(index: PassMarkIndex, normalizedQuery: string): DeviceIndexEntry | null {
  const matches = index.entries.filter((e) => e.normalizedName === normalizedQuery);
  if (matches.length === 0) return null;
  matches.sort((a, b) => (b.primaryMark ?? -1) - (a.primaryMark ?? -1));
  return matches[0];
}

/**
 * Resolve raw text to a benchmark result.
 *
 * `deviceType` forces a database (used by the CPU/GPU context-menu items and
 * the popup's type toggle). When omitted, the type is auto-detected from the
 * text. Never fabricates a score and never substitutes a different device:
 * anything short of an exact normalized match is returned as `candidates`.
 */
export async function lookup(
  rawText: string,
  forceRefresh = false,
  opts: { loose?: boolean; deviceType?: DeviceType } = {},
): Promise<LookupResult> {
  let type: DeviceType | undefined = opts.deviceType;
  let model: string | null;

  if (type) {
    // A forced type (context-menu item or popup toggle) is always an explicit
    // user action, so extract permissively within that one database.
    model = looseModel(rawText, type);
  } else if (opts.loose) {
    // Auto type, explicit action: detect the type; if detection fails, try a
    // loose CPU model first, then GPU, so an unusual manual query still works.
    const detected = detectDevice(rawText);
    if (detected) {
      type = detected.type;
      model = detected.model;
    } else {
      const looseCpu = looseModel(rawText, 'cpu');
      type = 'cpu';
      model = looseCpu ?? looseModel(rawText, 'gpu');
      if (!looseCpu && model) type = 'gpu';
    }
  } else {
    // Auto type, strict (the in-page selection button).
    const detected = detectDevice(rawText);
    type = detected?.type;
    model = detected?.model ?? null;
  }

  if (!type || !model) return { status: 'no_device' };

  const normalizedQuery = normalizeForMatch(model);
  if (!normalizedQuery) return { status: 'no_device', query: model, type };

  const cfg = DOMAINS[type];
  const settings = await getSettings();

  if (!forceRefresh) {
    const cached = await findSavedByNormalized(type, normalizedQuery);
    if (cached && Date.now() - cached.retrievedAt <= settings.cacheDurationMs) {
      return { status: 'cached', query: model, type, device: cached, stale: false };
    }
  }

  let index: PassMarkIndex | null;
  try {
    index = await ensureIndex(type, forceRefresh);
  } catch {
    index = null;
  }
  if (!index) {
    const cached = await findSavedByNormalized(type, normalizedQuery);
    if (cached) return { status: 'cached', query: model, type, device: cached, stale: true };
    return {
      status: 'passmark_unavailable',
      query: model,
      type,
      message: `The benchmark database could not be reached. Check your connection and that the extension has access to ${new URL(cfg.baseUrl).hostname}.`,
    };
  }

  const exact = findExact(index, normalizedQuery);
  if (exact) {
    const record = toRecord(cfg, await withSecondary(cfg, index, exact));
    await saveDevice(type, exact.id, record);
    return { status: 'ok', query: model, type, device: { ...record, id: exact.id }, stale: false };
  }

  const scored = scoreCandidates(normalizedQuery, index.entries, { minScore: 0.34, limit: 8 });
  if (scored.length === 0) {
    return { status: 'not_found', query: model, type, message: 'PassMark result not found.' };
  }
  return { status: 'candidates', query: model, type, candidates: scored.map((s) => s.entry) };
}

/** Resolve a specific PassMark id within a device type. */
export async function resolveById(id: string, type: DeviceType, forceRefresh = false): Promise<LookupResult> {
  const cfg = DOMAINS[type];
  let index: PassMarkIndex | null;
  try {
    index = await ensureIndex(type, forceRefresh);
  } catch {
    index = null;
  }
  if (!index) {
    return { status: 'passmark_unavailable', type, message: 'PassMark could not be reached. Please try again.' };
  }
  const entry = index.entries.find((e) => e.id === id);
  if (!entry) return { status: 'not_found', type, message: 'PassMark result not found.' };
  const record = toRecord(cfg, await withSecondary(cfg, index, entry));
  await saveDevice(type, entry.id, record);
  return { status: 'ok', type, device: { ...record, id: entry.id }, stale: false };
}
