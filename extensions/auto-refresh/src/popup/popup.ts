/**
 * The entire UI. It renders state and sends intent; it never schedules
 * anything itself. Closing the popup must not change behavior.
 */

import {
  CADENCE_PRESETS_SECONDS,
  DEFAULT_CADENCE_SECONDS,
  cadenceLabel,
  formatRemaining,
  normalizeCadence,
  secondsUntil,
} from '../lib/cadence.js';
import type { Request, TargetState } from '../lib/messages.js';

const PREFS_KEY = 'prefs';
const UNIT_MESSAGE = {
  seconds: 'cadenceSeconds',
  minutes: 'cadenceMinutes',
  hours: 'cadenceHours',
} as const;

interface Prefs {
  cadenceSeconds: number;
  bypassCache: boolean;
  seenFormDataWarning: boolean;
}

function t(key: string, substitutions?: string[]): string {
  return chrome.i18n.getMessage(key, substitutions);
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
}

async function readPrefs(): Promise<Prefs> {
  const stored = await chrome.storage.local.get(PREFS_KEY);
  const raw = stored[PREFS_KEY];
  const source = typeof raw === 'object' && raw !== null ? (raw as Partial<Prefs>) : {};
  return {
    cadenceSeconds: normalizeCadence(source.cadenceSeconds ?? DEFAULT_CADENCE_SECONDS),
    bypassCache: source.bypassCache === true,
    seenFormDataWarning: source.seenFormDataWarning === true,
  };
}

async function writePrefs(prefs: Prefs): Promise<void> {
  await chrome.storage.local.set({ [PREFS_KEY]: prefs });
}

async function send(request: Request): Promise<TargetState | null> {
  const response: unknown = await chrome.runtime.sendMessage(request);
  return (response ?? null) as TargetState | null;
}

async function activeTabId(): Promise<number | null> {
  // Returns tab ids without the "tabs" permission — only url/title need it,
  // and requesting those would show "Read your browsing history" at install.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return typeof tab?.id === 'number' ? tab.id : null;
}

function main(): void {
  const enabledInput = el<HTMLInputElement>('enabled');
  const cadenceSelect = el<HTMLSelectElement>('cadence');
  const bypassInput = el<HTMLInputElement>('bypass');
  const statusText = el<HTMLParagraphElement>('status');
  const notice = el<HTMLDivElement>('notice');
  const noticeDismiss = el<HTMLButtonElement>('notice-dismiss');

  el('enabled-label').textContent = t('enableLabel');
  el('cadence-label').textContent = t('cadenceLabel');
  el('bypass-label').textContent = t('bypassCacheLabel');
  el('bypass-hint').textContent = t('bypassCacheHint');
  el('notice-text').textContent = t('formDataWarning');
  noticeDismiss.textContent = t('dismiss');

  for (const seconds of CADENCE_PRESETS_SECONDS) {
    const { unit, count } = cadenceLabel(seconds);
    const option = document.createElement('option');
    option.value = String(seconds);
    option.textContent = t(UNIT_MESSAGE[unit], [String(count)]);
    cadenceSelect.append(option);
  }

  let tabId: number | null = null;
  let prefs: Prefs = {
    cadenceSeconds: DEFAULT_CADENCE_SECONDS,
    bypassCache: false,
    seenFormDataWarning: false,
  };
  let state: TargetState | null = null;
  let ticking: ReturnType<typeof setInterval> | undefined;

  function renderStatus(): void {
    if (!state?.enabled) {
      statusText.textContent = t('statusOff');
      return;
    }
    const remaining = secondsUntil(state.nextRefreshAt, Date.now());
    if (remaining === 0) {
      statusText.textContent = t('statusSoon');
      return;
    }
    const label = formatRemaining(remaining);
    const text = label.kind === 'seconds' ? t('secondsShort', [String(label.value)]) : label.value;
    statusText.textContent = t('statusNext', [text]);
  }

  function render(): void {
    enabledInput.checked = state?.enabled ?? false;
    const cadence = state?.enabled ? state.cadenceSeconds : prefs.cadenceSeconds;
    cadenceSelect.value = String(cadence);
    bypassInput.checked = state?.enabled ? state.bypassCache : prefs.bypassCache;
    renderStatus();

    clearInterval(ticking);
    if (state?.enabled) {
      ticking = setInterval(renderStatus, 1000);
    }
  }

  async function apply(): Promise<void> {
    if (tabId === null) return;
    const cadenceSeconds = normalizeCadence(Number(cadenceSelect.value));
    const bypassCache = bypassInput.checked;

    prefs = { ...prefs, cadenceSeconds, bypassCache };
    await writePrefs(prefs);

    state = enabledInput.checked
      ? await send({ type: 'enable', tabId, cadenceSeconds, bypassCache })
      : await send({ type: 'disable', tabId });

    render();
  }

  async function onEnabledChange(): Promise<void> {
    if (enabledInput.checked && !prefs.seenFormDataWarning) {
      notice.hidden = false;
      prefs = { ...prefs, seenFormDataWarning: true };
      await writePrefs(prefs);
    }
    await apply();
  }

  enabledInput.addEventListener('change', () => void onEnabledChange());
  cadenceSelect.addEventListener('change', () => void apply());
  bypassInput.addEventListener('change', () => void apply());
  noticeDismiss.addEventListener('click', () => {
    notice.hidden = true;
  });

  void (async () => {
    tabId = await activeTabId();
    prefs = await readPrefs();

    if (tabId === null) {
      statusText.textContent = t('noTab');
      enabledInput.disabled = true;
      cadenceSelect.disabled = true;
      bypassInput.disabled = true;
      return;
    }

    state = await send({ type: 'getState', tabId });
    render();
  })();
}

main();
