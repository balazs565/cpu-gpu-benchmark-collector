/**
 * Content script: shows a "⚡ Check Benchmark" trigger when the user selects a
 * CPU- or GPU-like string, and renders the PassMark result in a floating card
 * inside a shadow root — without ever opening a new tab.
 */

import { CONTENT_STYLES } from './content.styles';
import { detectDevice } from '../utils/extract';
import { sendMessage } from '../utils/messaging';
import type { RuntimeMessage, TabMessage } from '../utils/messaging';
import type { DeviceIndexEntry, DeviceRecord, DeviceType, LookupResult, Settings } from '../types';
import { formatScore, formatRank, timeAgo } from '../utils/format';

const MARGIN = 8;

let host: HTMLDivElement | null = null;
let shadow: ShadowRoot | null = null;
let panel: HTMLDivElement | null = null;
let mode: 'hidden' | 'trigger' | 'card' = 'hidden';
let lastRect: DOMRect | null = null;
let settings: Settings | null = null;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Partial<Record<string, string>> = {},
  children: Array<Node | string> = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  }
  for (const child of children) node.append(child instanceof Node ? child : document.createTextNode(child));
  return node;
}

function ensureHost(): void {
  if (host) return;
  host = document.createElement('div');
  host.setAttribute('data-cbc-host', '');
  host.style.setProperty('all', 'initial', 'important');
  shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = CONTENT_STYLES;
  panel = el('div', { class: 'cbc-root' });
  panel.style.display = 'none';
  shadow.append(style, panel);
  document.documentElement.appendChild(host);
}

function positionPanel(rect: DOMRect, w: number, h: number): void {
  if (!panel) return;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = rect.left;
  let top = rect.bottom + MARGIN;
  if (left + w > vw - MARGIN) left = vw - w - MARGIN;
  if (left < MARGIN) left = MARGIN;
  if (top + h > vh - MARGIN) {
    const above = rect.top - h - MARGIN;
    top = above > MARGIN ? above : Math.max(MARGIN, vh - h - MARGIN);
  }
  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(top)}px`;
}

function hide(): void {
  if (panel) {
    panel.style.display = 'none';
    panel.replaceChildren();
  }
  mode = 'hidden';
}

function boltSpan(): HTMLElement {
  return el('span', { class: 'cbc-bolt' }, ['⚡']);
}

function brandHead(type: DeviceType | undefined, onClose: () => void): HTMLElement {
  const brandChildren: Array<Node | string> = [boltSpan(), 'PassMark'];
  if (type) brandChildren.push(el('span', { class: `cbc-badge ${type}` }, [type.toUpperCase()]));
  const close = el('button', { class: 'cbc-close', 'aria-label': 'Close', title: 'Close' }, ['×']);
  close.addEventListener('click', onClose);
  return el('div', { class: 'cbc-card-head' }, [el('span', { class: 'cbc-brand' }, brandChildren), close]);
}

function renderLoading(query: string, type?: DeviceType): void {
  if (!panel) return;
  const card = el('div', { class: 'cbc-card' }, [
    brandHead(type, hide),
    el('div', { class: 'cbc-body' }, [
      el('p', { class: 'cbc-cpu-name' }, [query]),
      el('div', { class: 'cbc-loading' }, [el('span', { class: 'cbc-spinner' }), 'Searching PassMark…']),
    ]),
  ]);
  panel.replaceChildren(card);
  showCard();
}

function metaItem(label: string, value: string): HTMLElement {
  return el('div', { class: 'cbc-meta-item' }, [
    el('div', { class: 'cbc-meta-k' }, [label]),
    el('div', { class: 'cbc-meta-v' }, [value]),
  ]);
}

function recordBody(device: DeviceRecord & { id?: string }, opts: { cached: boolean; stale?: boolean }): HTMLElement {
  const body = el('div', { class: 'cbc-body' }, [
    el('p', { class: 'cbc-cpu-name' }, [device.deviceName]),
    el('div', { class: 'cbc-score-block' }, [
      el('div', { class: 'cbc-score-label' }, [device.primaryLabel]),
      el('div', { class: 'cbc-score-value' }, [formatScore(device.primaryMark)]),
    ]),
    el('div', { class: 'cbc-meta' }, [
      metaItem(device.secondaryLabel, formatScore(device.secondaryMark)),
      metaItem('Rank', formatRank(device.rank)),
    ]),
  ]);

  const hasLink = !!device.sourceUrl && /^https?:/i.test(device.sourceUrl);
  const brand = hasLink
    ? el('a', { class: 'cbc-source-link', href: device.sourceUrl, target: '_blank', rel: 'noopener noreferrer', title: 'View on PassMark' }, ['PassMark ↗'])
    : el('b', {}, ['PassMark']);
  const source = el('div', { class: `cbc-source${opts.stale ? ' cbc-stale' : ''}` }, ['Source: ', brand]);
  if (opts.cached || opts.stale) {
    source.append(document.createTextNode(` · ${opts.stale ? 'stale, ' : ''}retrieved ${timeAgo(device.retrievedAt)}`));
  }
  body.append(source);

  const actions = el('div', { class: 'cbc-actions' });
  const addBtn = el('button', { class: 'cbc-btn cbc-btn-primary' }, ['+ Add to comparison']);
  addBtn.addEventListener('click', async () => {
    if (!device.id) return;
    addBtn.setAttribute('disabled', 'true');
    try {
      await sendMessage({ type: 'ADD_COMPARISON', id: device.id, deviceType: device.type } as RuntimeMessage);
      addBtn.textContent = '✓ Added to comparison';
    } catch {
      addBtn.textContent = 'Could not add';
    }
  });
  actions.append(addBtn);
  if (opts.cached || opts.stale) {
    const refreshBtn = el('button', { class: 'cbc-btn' }, ['↻ Refresh']);
    refreshBtn.addEventListener('click', () => { if (device.id) refreshById(device.id, device.type, device.deviceName); });
    actions.append(refreshBtn);
  }
  body.append(actions);
  return body;
}

function renderMessage(icon: string, title: string, sub?: string, type?: DeviceType): void {
  if (!panel) return;
  const body = el('div', { class: 'cbc-body' }, [
    el('div', { class: 'cbc-msg' }, [el('span', { class: 'cbc-msg-icon' }, [icon]), ' ', title]),
  ]);
  if (sub) body.append(el('div', { class: 'cbc-msg-sub' }, [sub]));
  panel.replaceChildren(el('div', { class: 'cbc-card' }, [brandHead(type, hide), body]));
  showCard();
}

function renderCandidates(query: string, type: DeviceType, candidates: DeviceIndexEntry[]): void {
  if (!panel) return;
  const list = el('div', { class: 'cbc-cand-list' });
  for (const c of candidates) {
    const btn = el('button', { class: 'cbc-cand' }, [
      el('div', {}, [
        el('div', { class: 'cbc-cand-name' }, [c.name]),
        el('div', { class: 'cbc-cand-cat' }, [c.category || '—']),
      ]),
      el('div', { class: 'cbc-cand-mark' }, [formatScore(c.primaryMark)]),
    ]);
    btn.addEventListener('click', () => selectCandidate(c.id, type, c.name));
    list.append(btn);
  }
  panel.replaceChildren(
    el('div', { class: 'cbc-card' }, [
      brandHead(type, hide),
      el('div', { class: 'cbc-body' }, [
        el('p', { class: 'cbc-cand-head' }, ['No exact match for “' + query + '”']),
        el('p', { class: 'cbc-cand-sub' }, ['Select the correct PassMark ' + type.toUpperCase() + ':']),
        list,
      ]),
    ]),
  );
  showCard();
}

function renderResult(result: LookupResult): void {
  switch (result.status) {
    case 'ok':
    case 'cached':
      if (result.device) {
        panel!.replaceChildren(
          el('div', { class: 'cbc-card' }, [
            brandHead(result.device.type, hide),
            recordBody(result.device, { cached: result.status === 'cached', stale: result.stale }),
          ]),
        );
        showCard();
      }
      break;
    case 'candidates':
      renderCandidates(result.query ?? '', result.type ?? 'cpu', result.candidates ?? []);
      break;
    case 'no_device':
      renderMessage('🔍', 'No CPU or GPU detected', 'Select just the processor or graphics-card model.');
      break;
    case 'not_found':
      renderMessage('∅', 'PassMark result not found.', result.query ? `“${result.query}” is not in the PassMark database.` : undefined, result.type);
      break;
    case 'passmark_unavailable':
      renderMessage('⚠️', 'PassMark result not found.', result.message ?? 'The benchmark database could not be reached.', result.type);
      break;
    default:
      renderMessage('⚠️', 'Something went wrong.', result.message);
  }
}

function measureAndPosition(): void {
  if (!panel) return;
  const card = panel.querySelector('.cbc-card, .cbc-trigger') as HTMLElement | null;
  const rect = lastRect ?? new DOMRect(MARGIN, MARGIN, 0, 0);
  positionPanel(rect, card?.offsetWidth || 320, card?.offsetHeight || 160);
}

function showCard(): void {
  if (!panel) return;
  mode = 'card';
  panel.style.display = 'block';
  requestAnimationFrame(measureAndPosition);
}

async function runLookup(text: string): Promise<void> {
  ensureHost();
  const detected = detectDevice(text);
  renderLoading(detected?.model ?? text.trim(), detected?.type);
  try {
    const result = await sendMessage<LookupResult>({ type: 'LOOKUP', text } as RuntimeMessage);
    renderResult(result);
  } catch {
    renderMessage('⚠️', 'PassMark result not found.', 'The lookup could not be completed.');
  }
}

async function selectCandidate(id: string, type: DeviceType, name: string): Promise<void> {
  renderLoading(name, type);
  try {
    const result = await sendMessage<LookupResult>({ type: 'SELECT_CANDIDATE', id, deviceType: type } as RuntimeMessage);
    renderResult(result);
  } catch {
    renderMessage('⚠️', 'PassMark result not found.');
  }
}

async function refreshById(id: string, type: DeviceType, name: string): Promise<void> {
  renderLoading(name, type);
  try {
    const result = await sendMessage<LookupResult>({ type: 'REFRESH_DEVICE', id, deviceType: type } as RuntimeMessage);
    renderResult(result);
  } catch {
    renderMessage('⚠️', 'PassMark result not found.');
  }
}

function showTrigger(rect: DOMRect, text: string): void {
  ensureHost();
  if (!panel) return;
  lastRect = rect;
  const btn = el('button', { class: 'cbc-trigger' }, [boltSpan(), 'Check Benchmark']);
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    runLookup(text);
  });
  panel.replaceChildren(btn);
  panel.style.display = 'block';
  mode = 'trigger';
  requestAnimationFrame(measureAndPosition);
}

function selectionText(): { text: string; rect: DOMRect } | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const text = sel.toString().trim();
  if (!text || text.length > 200) return null;
  const rect = sel.getRangeAt(0).getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return { text, rect };
}

function isInsideHost(target: EventTarget | null): boolean {
  return !!host && target instanceof Node && host.contains(target);
}

function onPointerUp(e: MouseEvent): void {
  if (isInsideHost(e.target)) return;
  window.setTimeout(() => {
    const info = selectionText();
    if (!info) {
      if (mode === 'trigger') hide();
      return;
    }
    if (settings && settings.showSelectionButton === false) return;
    if (detectDevice(info.text)) showTrigger(info.rect, info.text);
    else if (mode === 'trigger') hide();
  }, 10);
}

function onPointerDown(e: MouseEvent): void {
  if (isInsideHost(e.target)) return;
  if (mode === 'card' || mode === 'trigger') hide();
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && mode !== 'hidden') hide();
}

document.addEventListener('mouseup', onPointerUp, true);
document.addEventListener('mousedown', onPointerDown, true);
document.addEventListener('keydown', onKeyDown, true);
window.addEventListener('scroll', () => { if (mode !== 'hidden') measureAndPosition(); }, true);

chrome.runtime.onMessage.addListener((message: TabMessage) => {
  if (message?.type === 'RENDER_RESULT') {
    ensureHost();
    const info = selectionText();
    if (info) lastRect = info.rect;
    renderResult(message.result);
  }
});

sendMessage<{ settings: Settings }>({ type: 'GET_SETTINGS' } as RuntimeMessage)
  .then((r) => { settings = r.settings; })
  .catch(() => { /* keep defaults */ });
