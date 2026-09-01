/**
 * Popup UI: manual search (Auto/CPU/GPU), saved devices, comparison, settings.
 */

import './popup.css';
import { el, clear } from '../utils/dom';
import { sendMessage } from '../utils/messaging';
import type { RuntimeMessage, ComparisonResponse } from '../utils/messaging';
import type { DeviceIndexEntry, DeviceRecord, DeviceType, LookupResult, Settings } from '../types';
import {
  formatScore,
  formatRank,
  timeAgo,
  formatDateTime,
  percentageDifference,
  formatSignedPercent,
} from '../utils/format';

type SavedDevice = DeviceRecord & { id: string };
type ForcedType = 'auto' | DeviceType;

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

const searchForm = $('#search-form') as HTMLFormElement;
const searchInput = $('#search-input') as HTMLInputElement;
const searchBtn = $('#search-btn') as HTMLButtonElement;
const resultEl = $('#search-result');
const savedPanel = $('#tab-saved');
const comparisonPanel = $('#tab-comparison');
const settingsBtn = $('#settings-btn');

let forcedType: ForcedType = 'auto';

/* ------------------------------- toggle ---------------------------------- */

document.querySelectorAll<HTMLButtonElement>('.seg-btn').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.seg-btn').forEach((x) => x.classList.remove('is-active'));
    b.classList.add('is-active');
    forcedType = (b.dataset.type as ForcedType) ?? 'auto';
    searchInput.focus();
  });
});

/* -------------------------------- tabs ----------------------------------- */

document.querySelectorAll<HTMLButtonElement>('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('is-active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('is-active'));
    tab.classList.add('is-active');
    const which = tab.dataset.tab;
    $(`#tab-${which}`).classList.add('is-active');
    if (which === 'comparison') renderComparison();
    if (which === 'saved') renderSaved();
  });
});

/* --------------------------- manual search ------------------------------- */

searchForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = searchInput.value.trim();
  if (text) await runSearch(text, false);
});

async function runSearch(text: string, forceRefresh: boolean): Promise<void> {
  resultEl.hidden = false;
  searchBtn.disabled = true;
  clear(resultEl);
  resultEl.append(el('div', { class: 'loading' }, [el('span', { class: 'spinner' }), 'Searching PassMark…']));
  const msg: RuntimeMessage = {
    type: 'LOOKUP',
    text,
    forceRefresh,
    loose: true,
    ...(forcedType !== 'auto' ? { deviceType: forcedType } : {}),
  };
  try {
    const result = await sendMessage<LookupResult>(msg);
    renderSearchResult(result);
    await renderSaved();
  } catch {
    renderNotice('⚠️', 'PassMark result not found.', 'The lookup could not be completed.');
  } finally {
    searchBtn.disabled = false;
  }
}

function renderSearchResult(result: LookupResult): void {
  clear(resultEl);
  resultEl.hidden = false;
  switch (result.status) {
    case 'ok':
    case 'cached':
      if (result.device) resultEl.append(resultCard(result.device, result.status === 'cached', result.stale));
      break;
    case 'candidates':
      resultEl.append(candidateBlock(result.query ?? '', result.type ?? 'cpu', result.candidates ?? []));
      break;
    case 'no_device':
      renderNotice('🔍', 'No CPU or GPU detected', 'Type just the processor or graphics-card model, or pick CPU/GPU above.');
      break;
    case 'not_found':
      renderNotice('∅', 'PassMark result not found.', result.query ? `“${result.query}” is not in the PassMark database.` : undefined);
      break;
    case 'passmark_unavailable':
      renderNotice('⚠️', 'PassMark result not found.', result.message ?? 'The benchmark database could not be reached.');
      break;
    default:
      renderNotice('⚠️', 'Something went wrong.', result.message);
  }
}

function renderNotice(icon: string, title: string, sub?: string): void {
  clear(resultEl);
  resultEl.hidden = false;
  resultEl.append(
    el('div', { class: 'notice' }, [
      el('span', { class: 'ic' }, [icon]),
      el('div', {}, [el('div', { class: 'tt' }, [title]), sub ? el('div', { class: 'sub' }, [sub]) : null]),
    ]),
  );
}

function typeBadge(type: DeviceType): HTMLElement {
  return el('span', { class: `badge ${type}` }, [type.toUpperCase()]);
}

function resultCard(device: SavedDevice | (DeviceRecord & { id?: string }), cached: boolean, stale?: boolean): HTMLElement {
  const hasLink = !!device.sourceUrl && /^https?:/i.test(device.sourceUrl);
  const brand = hasLink
    ? el('a', { class: 'source-link', href: device.sourceUrl, target: '_blank', rel: 'noopener noreferrer', title: 'View this device on PassMark' }, ['PassMark ↗'])
    : el('b', {}, ['PassMark']);
  const source = el('div', { class: `result-source${stale ? ' stale' : ''}` }, ['Source: ', brand]);
  if (cached || stale) source.append(document.createTextNode(` · ${stale ? 'stale, ' : ''}retrieved ${timeAgo(device.retrievedAt)}`));

  const actions = el('div', { class: 'result-actions' });
  const addBtn = el('button', { class: 'btn btn-primary' }, ['+ Add to comparison']);
  addBtn.addEventListener('click', async () => {
    if (!device.id) return;
    addBtn.disabled = true;
    await sendMessage({ type: 'ADD_COMPARISON', id: device.id, deviceType: device.type } as RuntimeMessage);
    addBtn.textContent = '✓ Added';
  });
  const refreshBtn = el('button', { class: 'btn' }, ['↻ Refresh']);
  refreshBtn.addEventListener('click', () => runSearch(device.deviceName, true));
  actions.append(addBtn, refreshBtn);

  return el('div', { class: 'result-card' }, [
    el('div', { class: 'result-top' }, [el('div', { class: 'result-name' }, [device.deviceName]), typeBadge(device.type)]),
    el('div', { class: 'result-score' }, [
      el('div', { class: 'k' }, [device.primaryLabel]),
      el('div', { class: 'v' }, [formatScore(device.primaryMark)]),
    ]),
    el('div', { class: 'result-meta' }, [
      metaBox(device.secondaryLabel, formatScore(device.secondaryMark)),
      metaBox('Rank', formatRank(device.rank)),
    ]),
    source,
    actions,
  ]);
}

function metaBox(k: string, v: string): HTMLElement {
  return el('div', { class: 'meta-box' }, [el('div', { class: 'k' }, [k]), el('div', { class: 'v' }, [v])]);
}

function candidateBlock(query: string, type: DeviceType, candidates: DeviceIndexEntry[]): HTMLElement {
  const list = el('div', { class: 'cand-list' });
  for (const c of candidates) {
    const btn = el('button', { class: 'cand' }, [
      el('div', {}, [el('div', { class: 'nm' }, [c.name]), el('div', { class: 'ct' }, [c.category || '—'])]),
      el('div', { class: 'mk' }, [formatScore(c.primaryMark)]),
    ]);
    btn.addEventListener('click', async () => {
      clear(resultEl);
      resultEl.append(el('div', { class: 'loading' }, [el('span', { class: 'spinner' }), 'Loading…']));
      const result = await sendMessage<LookupResult>({ type: 'SELECT_CANDIDATE', id: c.id, deviceType: type } as RuntimeMessage);
      renderSearchResult(result);
      await renderSaved();
    });
    list.append(btn);
  }
  return el('div', { class: 'notice' }, [
    el('span', { class: 'ic' }, ['❓']),
    el('div', { style: 'flex:1' }, [
      el('div', { class: 'tt' }, [`No exact match for “${query}”`]),
      el('div', { class: 'sub' }, [`Select the correct PassMark ${type.toUpperCase()}:`]),
      list,
    ]),
  ]);
}

/* ------------------------------ saved list ------------------------------- */

async function renderSaved(): Promise<void> {
  const { devices } = await sendMessage<{ devices: SavedDevice[] }>({ type: 'GET_SAVED' } as RuntimeMessage);
  clear(savedPanel);
  if (devices.length === 0) {
    savedPanel.append(emptyState('🗂️', 'No saved devices yet', 'Select a CPU or GPU on any page, or search above.'));
    return;
  }
  const cpus = devices.filter((d) => d.type === 'cpu');
  const gpus = devices.filter((d) => d.type === 'gpu');
  if (cpus.length) {
    savedPanel.append(sectionTitle('CPUs', 'cpu', cpus.length));
    cpus.forEach((d) => savedPanel.append(savedItem(d)));
  }
  if (gpus.length) {
    savedPanel.append(sectionTitle('GPUs', 'gpu', gpus.length));
    gpus.forEach((d) => savedPanel.append(savedItem(d)));
  }
}

function sectionTitle(label: string, type: DeviceType, count: number): HTMLElement {
  return el('div', { class: 'section-title' }, [typeBadge(type), `${label} (${count})`]);
}

function savedItem(device: SavedDevice): HTMLElement {
  const compareBtn = el('button', { class: 'btn btn-sm' }, ['Compare']);
  compareBtn.addEventListener('click', async () => {
    await sendMessage({ type: 'ADD_COMPARISON', id: device.id, deviceType: device.type } as RuntimeMessage);
    compareBtn.textContent = '✓ Added';
    compareBtn.disabled = true;
  });
  const refreshBtn = el('button', { class: 'btn btn-sm' }, ['↻ Refresh']);
  refreshBtn.addEventListener('click', async () => {
    refreshBtn.disabled = true;
    refreshBtn.textContent = '…';
    await sendMessage({ type: 'REFRESH_DEVICE', id: device.id, deviceType: device.type } as RuntimeMessage);
    await renderSaved();
  });
  const delBtn = el('button', { class: 'btn btn-sm btn-danger' }, ['Delete']);
  delBtn.addEventListener('click', async () => {
    await sendMessage({ type: 'DELETE_DEVICE', id: device.id, deviceType: device.type } as RuntimeMessage);
    await renderSaved();
  });

  return el('div', { class: 'saved-item' }, [
    el('div', { class: 'saved-top' }, [
      el('div', { class: 'saved-name' }, [device.deviceName]),
      el('div', { class: `saved-mark ${device.type}` }, [formatScore(device.primaryMark)]),
    ]),
    el('div', { class: 'saved-sub' }, [
      el('span', { class: 'pill' }, [device.primaryLabel]),
      el('span', { title: formatDateTime(device.retrievedAt) }, [`retrieved ${timeAgo(device.retrievedAt)}`]),
    ]),
    el('div', { class: 'saved-actions' }, [compareBtn, refreshBtn, delBtn]),
  ]);
}

/* ------------------------------ comparison ------------------------------- */

async function renderComparison(): Promise<void> {
  const { cpu, gpu } = await sendMessage<ComparisonResponse>({ type: 'GET_COMPARISON' } as RuntimeMessage);
  clear(comparisonPanel);
  if (cpu.length === 0 && gpu.length === 0) {
    comparisonPanel.append(emptyState('📊', 'Comparison is empty', 'Add CPUs or GPUs with “Compare” or “+ Add to comparison”.'));
    return;
  }
  renderComparisonSection('cpu', 'CPUs — CPU Mark', cpu);
  renderComparisonSection('gpu', 'GPUs — G3D Mark', gpu);
  comparisonPanel.append(
    el('div', { class: 'cmp-note' }, ['Difference is vs the fastest device within each group. CPU Mark and G3D Mark are different metrics and are not compared across groups.']),
  );
}

function renderComparisonSection(type: DeviceType, title: string, devices: SavedDevice[]): void {
  if (devices.length === 0) return;
  const sorted = [...devices].sort((a, b) => (b.primaryMark ?? -1) - (a.primaryMark ?? -1));
  const fastest = sorted[0].primaryMark ?? 0;

  const clearBtn = el('button', { class: 'btn btn-sm btn-danger' }, ['Clear']);
  clearBtn.addEventListener('click', async () => {
    await sendMessage({ type: 'CLEAR_COMPARISON', deviceType: type } as RuntimeMessage);
    await renderComparison();
  });

  comparisonPanel.append(
    el('div', { class: 'cmp-head' }, [
      el('div', { class: 'ttl' }, [typeBadge(type), `${title} (${sorted.length})`]),
      clearBtn,
    ]),
  );

  for (const d of sorted) {
    const mark = d.primaryMark ?? 0;
    const pct = fastest ? percentageDifference(mark, fastest) : 0;
    const rel = fastest ? (mark / fastest) * 100 : 0;
    const isFastest = mark === fastest;
    const diffClass = isFastest ? 'zero' : pct < 0 ? 'neg' : 'pos';
    const diffLabel = isFastest ? 'fastest' : formatSignedPercent(pct);

    const removeBtn = el('button', { class: 'cmp-remove', title: 'Remove' }, ['✕']);
    removeBtn.addEventListener('click', async () => {
      await sendMessage({ type: 'REMOVE_COMPARISON', id: d.id, deviceType: type } as RuntimeMessage);
      await renderComparison();
    });

    comparisonPanel.append(
      el('div', { class: 'cmp-row' }, [
        el('div', { class: 'cmp-line1' }, [
          el('div', { class: 'cmp-name' }, [d.deviceName]),
          el('div', { style: 'display:flex;gap:8px;align-items:baseline' }, [
            el('span', { class: 'cmp-mark' }, [formatScore(d.primaryMark)]),
            removeBtn,
          ]),
        ]),
        el('div', { class: 'cmp-line2' }, [
          el('div', { class: 'bar-track' }, [el('div', { class: `bar-fill ${type}`, style: `width:${Math.max(2, rel).toFixed(1)}%` })]),
          el('div', { class: `cmp-diff ${diffClass}` }, [diffLabel]),
          el('div', { class: 'cmp-rel' }, [`${rel.toFixed(0)}%`]),
        ]),
      ]),
    );
  }
}

/* ------------------------------- settings -------------------------------- */

const CACHE_OPTIONS: Array<{ label: string; ms: number }> = [
  { label: '1 hour', ms: 60 * 60 * 1000 },
  { label: '6 hours', ms: 6 * 60 * 60 * 1000 },
  { label: '24 hours (default)', ms: 24 * 60 * 60 * 1000 },
  { label: '7 days', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: '30 days', ms: 30 * 24 * 60 * 60 * 1000 },
];

settingsBtn.addEventListener('click', () => toggleSettings());

async function toggleSettings(): Promise<void> {
  const existing = document.getElementById('settings-drawer');
  if (existing) { existing.remove(); return; }
  const { settings } = await sendMessage<{ settings: Settings }>({ type: 'GET_SETTINGS' } as RuntimeMessage);

  const select = el('select', {}, CACHE_OPTIONS.map((o) =>
    el('option', { value: String(o.ms), selected: o.ms === settings.cacheDurationMs }, [o.label]),
  )) as HTMLSelectElement;
  select.addEventListener('change', async () => {
    await sendMessage({ type: 'SET_SETTINGS', settings: { cacheDurationMs: Number(select.value) } } as RuntimeMessage);
  });

  const toggle = el('input', { type: 'checkbox', ...(settings.showSelectionButton ? { checked: true } : {}) }) as HTMLInputElement;
  toggle.addEventListener('change', async () => {
    await sendMessage({ type: 'SET_SETTINGS', settings: { showSelectionButton: toggle.checked } } as RuntimeMessage);
  });

  const clearBtn = el('button', { class: 'btn btn-sm' }, ['Clear PassMark cache']);
  clearBtn.addEventListener('click', async () => {
    await sendMessage({ type: 'CLEAR_INDEX' } as RuntimeMessage);
    clearBtn.textContent = '✓ Cleared';
  });

  $('.app').append(
    el('div', { class: 'settings', id: 'settings-drawer' }, [
      el('h3', {}, ['Settings']),
      el('div', { class: 'setting-row' }, [el('label', {}, ['Cache duration']), select]),
      el('div', { class: 'setting-row' }, [el('label', {}, ['Show “Check Benchmark” on selection']), toggle]),
      el('div', { class: 'setting-row' }, [el('label', {}, ['Force a fresh PassMark download']), clearBtn]),
      el('div', { class: 'hint' }, ['Cached devices older than the cache duration are re-fetched from PassMark automatically.']),
    ]),
  );
}

function emptyState(icon: string, title: string, sub: string): HTMLElement {
  return el('div', { class: 'empty' }, [
    el('div', { class: 'em-ic' }, [icon]),
    el('div', { class: 'em-tt' }, [title]),
    el('div', { class: 'em-sub' }, [sub]),
  ]);
}

/* --------------------------------- init ---------------------------------- */

renderSaved();
searchInput.focus();
