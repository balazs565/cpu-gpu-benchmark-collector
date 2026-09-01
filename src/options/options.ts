/** Options page: cache duration, selection-button toggle and cache controls. */

import './options.css';
import { el } from '../utils/dom';
import { sendMessage } from '../utils/messaging';
import type { RuntimeMessage } from '../utils/messaging';
import type { Settings } from '../types';
import { getIndex } from '../storage/storage';
import { timeAgo } from '../utils/format';

const CACHE_OPTIONS: Array<{ label: string; ms: number }> = [
  { label: '1 hour', ms: 60 * 60 * 1000 },
  { label: '6 hours', ms: 6 * 60 * 60 * 1000 },
  { label: '24 hours (default)', ms: 24 * 60 * 60 * 1000 },
  { label: '7 days', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: '30 days', ms: 30 * 24 * 60 * 60 * 1000 },
];

const cacheSelect = document.getElementById('cache') as HTMLSelectElement;
const selBtn = document.getElementById('selbtn') as HTMLInputElement;
const clearIndexBtn = document.getElementById('clear-index') as HTMLButtonElement;
const indexStatus = document.getElementById('index-status') as HTMLElement;
const saveNote = document.getElementById('save-note') as HTMLElement;

function flash(message: string): void {
  saveNote.textContent = message;
  window.setTimeout(() => { saveNote.textContent = ''; }, 1800);
}

async function refreshIndexStatus(): Promise<void> {
  const [cpu, gpu] = await Promise.all([getIndex('cpu'), getIndex('gpu')]);
  const parts: string[] = [];
  if (cpu) parts.push(`${cpu.entries.length.toLocaleString()} CPUs (updated ${timeAgo(cpu.fetchedAt)})`);
  if (gpu) parts.push(`${gpu.entries.length.toLocaleString()} GPUs (updated ${timeAgo(gpu.fetchedAt)})`);
  indexStatus.textContent = parts.length ? parts.join(' · ') : 'No PassMark data cached yet.';
}

async function init(): Promise<void> {
  const { settings } = await sendMessage<{ settings: Settings }>({ type: 'GET_SETTINGS' } as RuntimeMessage);

  for (const o of CACHE_OPTIONS) {
    cacheSelect.append(el('option', { value: String(o.ms), selected: o.ms === settings.cacheDurationMs }, [o.label]));
  }
  if (!CACHE_OPTIONS.some((o) => o.ms === settings.cacheDurationMs)) {
    const hrs = Math.round(settings.cacheDurationMs / 3_600_000);
    cacheSelect.append(el('option', { value: String(settings.cacheDurationMs), selected: true }, [`${hrs} hours (custom)`]));
  }
  selBtn.checked = settings.showSelectionButton;

  cacheSelect.addEventListener('change', async () => {
    await sendMessage({ type: 'SET_SETTINGS', settings: { cacheDurationMs: Number(cacheSelect.value) } } as RuntimeMessage);
    flash('Saved');
  });
  selBtn.addEventListener('change', async () => {
    await sendMessage({ type: 'SET_SETTINGS', settings: { showSelectionButton: selBtn.checked } } as RuntimeMessage);
    flash('Saved');
  });
  clearIndexBtn.addEventListener('click', async () => {
    await sendMessage({ type: 'CLEAR_INDEX' } as RuntimeMessage);
    flash('PassMark cache cleared');
    await refreshIndexStatus();
  });

  await refreshIndexStatus();
}

void init();
