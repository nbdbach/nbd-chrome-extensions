/**
 * The entire UI. It renders state and sends intent; it never schedules
 * anything itself. Closing the popup must not change behavior.
 */

import {
  CADENCE_UNITS,
  DEFAULT_CADENCE_SECONDS,
  type Cadence,
  type CadenceUnit,
  checkCadence,
  formatRemaining,
  fromSeconds,
  isCadenceUnit,
  maxInterval,
  minInterval,
  normalizeCadence,
  secondsUntil,
  toSeconds,
} from '../lib/cadence.js';
import type { Request, TargetState } from '../lib/messages.js';

const PREFS_KEY = 'prefs';

const UNIT_MESSAGE: Readonly<Record<CadenceUnit, string>> = {
  seconds: 'unitSeconds',
  minutes: 'unitMinutes',
  hours: 'unitHours',
};

const PROBLEM_MESSAGE = {
  'not-a-whole-number': 'cadenceNotWhole',
  'too-short': 'cadenceTooShort',
  'too-long': 'cadenceTooLong',
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
  const intervalInput = el<HTMLInputElement>('interval');
  const unitSelect = el<HTMLSelectElement>('unit');
  const bypassInput = el<HTMLInputElement>('bypass');
  const statusText = el<HTMLParagraphElement>('status');
  const errorText = el<HTMLParagraphElement>('cadence-error');
  const notice = el<HTMLDivElement>('notice');
  const noticeDismiss = el<HTMLButtonElement>('notice-dismiss');

  el('enabled-label').textContent = t('enableLabel');
  el('cadence-label').textContent = t('cadenceLabel');
  el('bypass-label').textContent = t('bypassCacheLabel');
  el('bypass-hint').textContent = t('bypassCacheHint');
  el('notice-text').textContent = t('formDataWarning');
  noticeDismiss.textContent = t('dismiss');
  intervalInput.setAttribute('aria-label', t('intervalLabel'));
  unitSelect.setAttribute('aria-label', t('unitLabel'));

  for (const unit of CADENCE_UNITS) {
    const option = document.createElement('option');
    option.value = unit;
    option.textContent = t(UNIT_MESSAGE[unit]);
    unitSelect.append(option);
  }

  let tabId: number | null = null;
  let prefs: Prefs = {
    cadenceSeconds: DEFAULT_CADENCE_SECONDS,
    bypassCache: false,
    seenFormDataWarning: false,
  };
  let state: TargetState | null = null;
  let ticking: ReturnType<typeof setInterval> | undefined;

  function selectedUnit(): CadenceUnit {
    return isCadenceUnit(unitSelect.value) ? unitSelect.value : 'minutes';
  }

  /** What the two fields currently say, whether or not it is usable. */
  function typedCadence(): Cadence {
    return { interval: Number(intervalInput.value), unit: selectedUnit() };
  }

  /** Keep the number field's own bounds in step with the chosen unit. */
  function applyBounds(unit: CadenceUnit): void {
    intervalInput.min = String(minInterval(unit));
    intervalInput.max = String(maxInterval(unit));
  }

  function showProblem(): ReturnType<typeof checkCadence> {
    const { interval, unit } = typedCadence();
    const problem = checkCadence(interval, unit);
    errorText.textContent = problem ? t(PROBLEM_MESSAGE[problem]) : '';
    errorText.hidden = problem === null;
    intervalInput.classList.toggle('invalid', problem !== null);

    // Refuse the turn-on rather than letting it flip and snap back. A tab that
    // is already refreshing keeps its toggle, so a half-typed number can never
    // strand the user with no way to switch it off.
    if (tabId !== null) {
      enabledInput.disabled = problem !== null && !(state?.enabled ?? false);
    }
    return problem;
  }

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

  function showCadence(seconds: number): void {
    const cadence = fromSeconds(seconds);
    unitSelect.value = cadence.unit;
    intervalInput.value = String(cadence.interval);
    applyBounds(cadence.unit);
  }

  function render(): void {
    enabledInput.checked = state?.enabled ?? false;
    showCadence(state?.enabled ? state.cadenceSeconds : prefs.cadenceSeconds);
    bypassInput.checked = state?.enabled ? state.bypassCache : prefs.bypassCache;
    showProblem();
    renderStatus();

    clearInterval(ticking);
    if (state?.enabled) {
      ticking = setInterval(renderStatus, 1000);
    }
  }

  async function apply(): Promise<void> {
    if (tabId === null) return;

    // An unusable interval is never sent on. Scheduling is left exactly as it
    // was, so a half-typed number cannot silently change a running refresh.
    if (showProblem() !== null) {
      enabledInput.checked = state?.enabled ?? false;
      return;
    }

    const cadenceSeconds = toSeconds(typedCadence());
    const bypassCache = bypassInput.checked;

    prefs = { ...prefs, cadenceSeconds, bypassCache };
    await writePrefs(prefs);

    state = enabledInput.checked
      ? await send({ type: 'enable', tabId, cadenceSeconds, bypassCache })
      : await send({ type: 'disable', tabId });

    renderStatus();
    clearInterval(ticking);
    if (state?.enabled) ticking = setInterval(renderStatus, 1000);
  }

  async function onEnabledChange(): Promise<void> {
    if (enabledInput.checked && showProblem() === null && !prefs.seenFormDataWarning) {
      notice.hidden = false;
      prefs = { ...prefs, seenFormDataWarning: true };
      await writePrefs(prefs);
    }
    await apply();
  }

  function onUnitChange(): void {
    applyBounds(selectedUnit());
    void apply();
  }

  enabledInput.addEventListener('change', () => void onEnabledChange());
  intervalInput.addEventListener('change', () => void apply());
  unitSelect.addEventListener('change', onUnitChange);
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
      intervalInput.disabled = true;
      unitSelect.disabled = true;
      bypassInput.disabled = true;
      return;
    }

    state = await send({ type: 'getState', tabId });
    render();
  })();
}

main();
