/**
 * Local persistence built on chrome.storage.local.
 *
 * Stored keys:
 *  - `passmark_index_cpu` / `passmark_index_gpu`  cached PassMark mega lists
 *  - `saved_devices`                              devices the user looked up
 *  - `comparison_cpu` / `comparison_gpu`          separate comparison lists
 *  - `settings`                                   user configuration
 */

import {
  type DeviceRecord,
  type DeviceType,
  type PassMarkIndex,
  type Settings,
  DEFAULT_SETTINGS,
} from '../types';

const KEY_INDEX: Record<DeviceType, string> = {
  cpu: 'passmark_index_cpu',
  gpu: 'passmark_index_gpu',
};
const KEY_SAVED = 'saved_devices';
const KEY_COMPARISON: Record<DeviceType, string> = {
  cpu: 'comparison_cpu',
  gpu: 'comparison_gpu',
};
const KEY_SETTINGS = 'settings';

function get<T>(key: string): Promise<T | undefined> {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (res) => resolve(res?.[key] as T | undefined));
  });
}
function set(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => chrome.storage.local.set(items, () => resolve()));
}

/* ------------------------------- settings -------------------------------- */

export async function getSettings(): Promise<Settings> {
  const stored = await get<Partial<Settings>>(KEY_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
}
export async function setSettings(partial: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...partial };
  await set({ [KEY_SETTINGS]: next });
  return next;
}

/* --------------------------- PassMark indexes ---------------------------- */

export function getIndex(type: DeviceType): Promise<PassMarkIndex | undefined> {
  return get<PassMarkIndex>(KEY_INDEX[type]);
}
export function setIndex(type: DeviceType, index: PassMarkIndex): Promise<void> {
  return set({ [KEY_INDEX[type]]: index });
}
export function clearIndexes(): Promise<void> {
  return new Promise((resolve) =>
    chrome.storage.local.remove([KEY_INDEX.cpu, KEY_INDEX.gpu], () => resolve()),
  );
}

/* ----------------------------- saved devices ----------------------------- */

/** Saved devices keyed by `${type}:${id}` to keep CPU and GPU ids distinct. */
type SavedRecord = DeviceRecord & { id: string };
type SavedMap = Record<string, SavedRecord>;

function savedKey(type: DeviceType, id: string): string {
  return `${type}:${id}`;
}

export async function getSavedMap(): Promise<SavedMap> {
  return (await get<SavedMap>(KEY_SAVED)) ?? {};
}

export async function getSavedList(): Promise<SavedRecord[]> {
  const map = await getSavedMap();
  return Object.values(map).sort((a, b) => {
    if (a.type !== b.type) return a.type === 'cpu' ? -1 : 1;
    return (b.primaryMark ?? -1) - (a.primaryMark ?? -1);
  });
}

export async function saveDevice(type: DeviceType, id: string, record: DeviceRecord): Promise<void> {
  const map = await getSavedMap();
  map[savedKey(type, id)] = { ...record, id };
  await set({ [KEY_SAVED]: map });
}

export async function getSavedById(type: DeviceType, id: string): Promise<SavedRecord | undefined> {
  const map = await getSavedMap();
  return map[savedKey(type, id)];
}

export async function findSavedByNormalized(
  type: DeviceType,
  normalizedName: string,
): Promise<SavedRecord | undefined> {
  const map = await getSavedMap();
  return Object.values(map).find((r) => r.type === type && r.normalizedName === normalizedName);
}

export async function deleteDevice(type: DeviceType, id: string): Promise<void> {
  const map = await getSavedMap();
  delete map[savedKey(type, id)];
  await set({ [KEY_SAVED]: map });
  await removeFromComparison(type, id);
}

/* ----------------------------- comparison -------------------------------- */

export async function getComparisonIds(type: DeviceType): Promise<string[]> {
  return (await get<string[]>(KEY_COMPARISON[type])) ?? [];
}

export async function addToComparison(type: DeviceType, id: string): Promise<void> {
  const ids = await getComparisonIds(type);
  if (!ids.includes(id)) ids.push(id);
  await set({ [KEY_COMPARISON[type]]: ids });
}

export async function removeFromComparison(type: DeviceType, id: string): Promise<void> {
  const ids = (await getComparisonIds(type)).filter((x) => x !== id);
  await set({ [KEY_COMPARISON[type]]: ids });
}

export async function clearComparison(type?: DeviceType): Promise<void> {
  if (!type) {
    await set({ [KEY_COMPARISON.cpu]: [], [KEY_COMPARISON.gpu]: [] });
  } else {
    await set({ [KEY_COMPARISON[type]]: [] });
  }
}

export async function getComparisonRecords(type: DeviceType): Promise<SavedRecord[]> {
  const ids = await getComparisonIds(type);
  const map = await getSavedMap();
  return ids.map((id) => map[savedKey(type, id)]).filter((r): r is SavedRecord => Boolean(r));
}
