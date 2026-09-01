/**
 * Background service worker: context menus, message routing, network access.
 */

import { lookup, resolveById } from '../services/passmark';
import type { RuntimeMessage, TabMessage } from '../utils/messaging';
import type { DeviceType } from '../types';
import {
  getSavedList,
  deleteDevice,
  getComparisonRecords,
  addToComparison,
  removeFromComparison,
  clearComparison,
  getSettings,
  setSettings,
  clearIndexes,
  getSavedById,
} from '../storage/storage';

const MENU_CPU = 'check-cpu-benchmark';
const MENU_GPU = 'check-gpu-benchmark';

function registerContextMenus(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU_CPU, title: 'Check CPU Benchmark', contexts: ['selection'] });
    chrome.contextMenus.create({ id: MENU_GPU, title: 'Check GPU Benchmark', contexts: ['selection'] });
  });
}

chrome.runtime.onInstalled.addListener(registerContextMenus);
chrome.runtime.onStartup.addListener(registerContextMenus);

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const text = (info.selectionText ?? '').trim();
  if (!text || !tab?.id) return;
  const deviceType: DeviceType | undefined =
    info.menuItemId === MENU_CPU ? 'cpu' : info.menuItemId === MENU_GPU ? 'gpu' : undefined;
  if (!deviceType) return;

  const result = await lookup(text, false, { loose: true, deviceType });
  const message: TabMessage = { type: 'RENDER_RESULT', result };
  try {
    await chrome.tabs.sendMessage(tab.id, message);
  } catch {
    /* content script unavailable (e.g. PDF viewer / restricted page) */
  }
});

/* --------------------------- message routing ----------------------------- */

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  handleMessage(message)
    .then((response) => sendResponse(response))
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error('[CPU & GPU Benchmark Collector]', error);
      sendResponse({ status: 'error', message: 'Something went wrong. Please try again.' });
    });
  return true;
});

async function handleMessage(message: RuntimeMessage): Promise<unknown> {
  switch (message.type) {
    case 'LOOKUP':
      return lookup(message.text, message.forceRefresh ?? false, {
        loose: message.loose ?? false,
        deviceType: message.deviceType,
      });

    case 'SELECT_CANDIDATE':
      return resolveById(message.id, message.deviceType);

    case 'REFRESH_DEVICE': {
      const existing = await getSavedById(message.deviceType, message.id);
      const result = await resolveById(message.id, message.deviceType, true);
      if (result.status !== 'ok' && existing) {
        return { status: 'cached', type: message.deviceType, device: existing, stale: true };
      }
      return result;
    }

    case 'GET_SAVED':
      return { devices: await getSavedList() };

    case 'DELETE_DEVICE':
      await deleteDevice(message.deviceType, message.id);
      return { devices: await getSavedList() };

    case 'GET_COMPARISON':
      return { cpu: await getComparisonRecords('cpu'), gpu: await getComparisonRecords('gpu') };

    case 'ADD_COMPARISON':
      await addToComparison(message.deviceType, message.id);
      return { cpu: await getComparisonRecords('cpu'), gpu: await getComparisonRecords('gpu') };

    case 'REMOVE_COMPARISON':
      await removeFromComparison(message.deviceType, message.id);
      return { cpu: await getComparisonRecords('cpu'), gpu: await getComparisonRecords('gpu') };

    case 'CLEAR_COMPARISON':
      await clearComparison(message.deviceType);
      return { cpu: await getComparisonRecords('cpu'), gpu: await getComparisonRecords('gpu') };

    case 'GET_SETTINGS':
      return { settings: await getSettings() };

    case 'SET_SETTINGS':
      return { settings: await setSettings(message.settings) };

    case 'CLEAR_INDEX':
      await clearIndexes();
      return { ok: true };

    default:
      return { status: 'error', message: 'Unknown request.' };
  }
}
