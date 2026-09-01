/** Typed message protocol between content script, popup, options and the worker. */

import type { LookupResult, DeviceRecord, Settings, DeviceType } from '../types';

export type RuntimeMessage =
  | { type: 'LOOKUP'; text: string; forceRefresh?: boolean; loose?: boolean; deviceType?: DeviceType }
  | { type: 'SELECT_CANDIDATE'; id: string; deviceType: DeviceType }
  | { type: 'REFRESH_DEVICE'; id: string; deviceType: DeviceType }
  | { type: 'GET_SAVED' }
  | { type: 'DELETE_DEVICE'; id: string; deviceType: DeviceType }
  | { type: 'GET_COMPARISON' }
  | { type: 'ADD_COMPARISON'; id: string; deviceType: DeviceType }
  | { type: 'REMOVE_COMPARISON'; id: string; deviceType: DeviceType }
  | { type: 'CLEAR_COMPARISON'; deviceType?: DeviceType }
  | { type: 'GET_SETTINGS' }
  | { type: 'SET_SETTINGS'; settings: Partial<Settings> }
  | { type: 'CLEAR_INDEX' };

export type TabMessage = { type: 'RENDER_RESULT'; result: LookupResult };

export interface SavedResponse {
  devices: Array<DeviceRecord & { id: string }>;
}

export interface ComparisonResponse {
  cpu: Array<DeviceRecord & { id: string }>;
  gpu: Array<DeviceRecord & { id: string }>;
}

export interface SettingsResponse {
  settings: Settings;
}

export function sendMessage<R = unknown>(message: RuntimeMessage): Promise<R> {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
          return;
        }
        resolve(response as R);
      });
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}
