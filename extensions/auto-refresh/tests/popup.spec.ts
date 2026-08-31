// @vitest-environment jsdom
/**
 * Drives the real popup markup against the real service worker, both wired to
 * the same fake chrome API. Testing them together is deliberate: the thing most
 * likely to break is the seam between them, and a mock on either side would
 * hide exactly that.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// The real markup, not a copy: a test against hand-written HTML would keep
// passing after someone renames an id in the page the extension ships.
import PAGE from '../src/popup/popup.html?raw';
import { createFakeChrome, installFakeChrome, type FakeChrome } from './fake-chrome.js';

const TAB = 7;
const BODY = /<body>([\s\S]*?)<\/body>/.exec(PAGE)?.[1] ?? '';

let fake: FakeChrome;

function $<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
}

/** Pass activeTabId: null to simulate a window with no addressable tab. */
async function openPopup(options: { activeTabId?: number | null } = {}): Promise<void> {
  const activeTabId = options.activeTabId === null ? undefined : (options.activeTabId ?? TAB);
  fake = createFakeChrome({ openTabIds: [TAB], activeTabId });
  installFakeChrome(fake);
  document.body.innerHTML = BODY;

  vi.resetModules();
  await import('../src/background/service-worker.js');
  await import('../src/popup/popup.js');
  await vi.waitFor(() => expect($('enabled-label').textContent).toBeTruthy());
  await flush();
}

/**
 * The change handlers are async and nothing signals when they settle, so give
 * the whole chain (prefs write, message round trip, re-render) room to finish.
 */
async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

async function change(element: HTMLElement): Promise<void> {
  element.dispatchEvent(new Event('change'));
  await flush();
}

beforeEach(async () => {
  await openPopup();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('markup is wired to _locales, never to inline English', () => {
  it('labels every control from a message key', () => {
    expect($('enabled-label').textContent).toBe('enableLabel');
    expect($('cadence-label').textContent).toBe('cadenceLabel');
    expect($('bypass-label').textContent).toBe('bypassCacheLabel');
    expect($('bypass-hint').textContent).toBe('bypassCacheHint');
    expect($('notice-text').textContent).toBe('formDataWarning');
  });

  it('offers the three units, labelled from _locales', () => {
    const options = [...$<HTMLSelectElement>('unit').options];
    expect(options.map((option) => option.value)).toEqual(['seconds', 'minutes', 'hours']);
    expect(options.map((option) => option.textContent)).toEqual([
      'unitSeconds',
      'unitMinutes',
      'unitHours',
    ]);
  });

  it('shows the stored cadence split into interval and unit', () => {
    expect($<HTMLInputElement>('interval').value).toBe('1');
    expect($<HTMLSelectElement>('unit').value).toBe('minutes');
  });

  it('labels both fields for screen readers', () => {
    expect($('interval').getAttribute('aria-label')).toBe('intervalLabel');
    expect($('unit').getAttribute('aria-label')).toBe('unitLabel');
  });

  it('starts off', () => {
    expect($<HTMLInputElement>('enabled').checked).toBe(false);
    expect($('status').textContent).toBe('statusOff');
  });
});

describe('with no addressable tab', () => {
  it('says so and disables the controls rather than failing silently', async () => {
    await openPopup({ activeTabId: null });
    await vi.waitFor(() => expect($('status').textContent).toBe('noTab'));

    expect($<HTMLInputElement>('enabled').disabled).toBe(true);
    expect($<HTMLInputElement>('interval').disabled).toBe(true);
    expect($<HTMLSelectElement>('unit').disabled).toBe(true);
    expect($<HTMLInputElement>('bypass').disabled).toBe(true);
  });
});

describe('turning it on', () => {
  it('asks the worker to schedule, and shows a countdown', async () => {
    const toggle = $<HTMLInputElement>('enabled');
    toggle.checked = true;
    await change(toggle);

    expect(fake.alarms.all.size).toBe(1);
    expect($('status').textContent).toMatch(/^statusNext\(/);
  });

  it('warns once that reloading discards typed input', async () => {
    const toggle = $<HTMLInputElement>('enabled');
    toggle.checked = true;
    await change(toggle);

    expect($('notice').hidden).toBe(false);
  });

  it('does not warn again on a later visit', async () => {
    const toggle = $<HTMLInputElement>('enabled');
    toggle.checked = true;
    await change(toggle);

    // Same stored prefs, fresh popup.
    const prefs = fake.storage.local.data.get('prefs');
    document.body.innerHTML = BODY;
    vi.resetModules();
    await fake.storage.local.set({ prefs });
    await import('../src/popup/popup.js');
    await flush();

    expect($('notice').hidden).toBe(true);
  });

  it('dismissing the notice hides it', async () => {
    const toggle = $<HTMLInputElement>('enabled');
    toggle.checked = true;
    await change(toggle);

    $<HTMLButtonElement>('notice-dismiss').click();
    expect($('notice').hidden).toBe(true);
  });
});

describe('changing the cadence', () => {
  it('reschedules while enabled', async () => {
    const toggle = $<HTMLInputElement>('enabled');
    toggle.checked = true;
    await change(toggle);

    const interval = $<HTMLInputElement>('interval');
    interval.value = '10';
    await change(interval);

    expect(fake.alarms.all.get('refresh:7')?.periodInMinutes).toBe(10);
  });

  it('is remembered for the next tab even while off', async () => {
    const interval = $<HTMLInputElement>('interval');
    interval.value = '15';
    await change(interval);

    expect(fake.storage.local.data.get('prefs')).toMatchObject({ cadenceSeconds: 900 });
    expect(fake.alarms.all.size).toBe(0);
  });

  it('converts the unit as well as the number', async () => {
    const unit = $<HTMLSelectElement>('unit');
    const interval = $<HTMLInputElement>('interval');
    interval.value = '2';
    await change(interval);
    unit.value = 'hours';
    await change(unit);

    expect(fake.storage.local.data.get('prefs')).toMatchObject({ cadenceSeconds: 7200 });
  });

  it('adjusts the number field bounds to the chosen unit', async () => {
    const unit = $<HTMLSelectElement>('unit');
    const interval = $<HTMLInputElement>('interval');

    unit.value = 'seconds';
    await change(unit);
    expect(interval.min).toBe('30');

    unit.value = 'hours';
    await change(unit);
    expect(interval.min).toBe('1');
    expect(interval.max).toBe('24');
  });
});

describe('bypass cache', () => {
  it('is passed through to the reload', async () => {
    const bypass = $<HTMLInputElement>('bypass');
    bypass.checked = true;
    await change(bypass);

    const toggle = $<HTMLInputElement>('enabled');
    toggle.checked = true;
    await change(toggle);

    fake.alarms.onAlarm.emit({ name: 'refresh:7' });
    await vi.waitFor(() => expect(fake.tabs.reloads[0]?.bypassCache).toBe(true));
  });
});

describe('turning it off', () => {
  it('clears the alarm and the countdown', async () => {
    const toggle = $<HTMLInputElement>('enabled');
    toggle.checked = true;
    await change(toggle);
    expect(fake.alarms.all.size).toBe(1);

    toggle.checked = false;
    await change(toggle);

    expect(fake.alarms.all.size).toBe(0);
    expect($('status').textContent).toBe('statusOff');
  });
});

describe('reopening the popup', () => {
  it('reflects a tab that is already refreshing', async () => {
    const toggle = $<HTMLInputElement>('enabled');
    toggle.checked = true;
    await change(toggle);

    document.body.innerHTML = BODY;
    vi.resetModules();
    await import('../src/popup/popup.js');
    await vi.waitFor(() => expect($<HTMLInputElement>('enabled').checked).toBe(true));
    await flush();

    expect($('status').textContent).toMatch(/^statusNext\(/);
  });
});

describe('an interval Chrome would not honour', () => {
  it('is refused with an explanation rather than silently clamped', async () => {
    const unit = $<HTMLSelectElement>('unit');
    const interval = $<HTMLInputElement>('interval');
    unit.value = 'seconds';
    await change(unit);
    interval.value = '10';
    await change(interval);

    expect($('cadence-error').hidden).toBe(false);
    expect($('cadence-error').textContent).toBe('cadenceTooShort');
    expect(interval.classList.contains('invalid')).toBe(true);
  });

  it('cannot be turned on at all', async () => {
    const unit = $<HTMLSelectElement>('unit');
    const interval = $<HTMLInputElement>('interval');
    unit.value = 'seconds';
    await change(unit);
    interval.value = '10';
    await change(interval);

    expect($<HTMLInputElement>('enabled').disabled).toBe(true);
  });

  it('is never scheduled even if the toggle is forced', async () => {
    const unit = $<HTMLSelectElement>('unit');
    const interval = $<HTMLInputElement>('interval');
    unit.value = 'seconds';
    await change(unit);
    interval.value = '10';
    await change(interval);

    const toggle = $<HTMLInputElement>('enabled');
    toggle.checked = true;
    await change(toggle);

    expect(fake.alarms.all.size).toBe(0);
    expect(toggle.checked).toBe(false);
  });

  it('leaves a running refresh untouched while the field is unusable', async () => {
    const toggle = $<HTMLInputElement>('enabled');
    toggle.checked = true;
    await change(toggle);
    expect(fake.alarms.all.get('refresh:7')?.periodInMinutes).toBe(1);

    const interval = $<HTMLInputElement>('interval');
    interval.value = '0';
    await change(interval);

    // Still scheduled at the last good value, not cleared and not rescheduled,
    // and the toggle stays usable so it can still be switched off.
    expect(fake.alarms.all.get('refresh:7')?.periodInMinutes).toBe(1);
    expect($('cadence-error').textContent).toBe('cadenceNotWhole');
    expect($<HTMLInputElement>('enabled').disabled).toBe(false);
  });

  it('clears the message once the value is usable again', async () => {
    const unit = $<HTMLSelectElement>('unit');
    const interval = $<HTMLInputElement>('interval');
    unit.value = 'seconds';
    await change(unit);
    interval.value = '10';
    await change(interval);
    expect($('cadence-error').hidden).toBe(false);

    interval.value = '45';
    await change(interval);
    expect($('cadence-error').hidden).toBe(true);
    expect(interval.classList.contains('invalid')).toBe(false);
  });

  it('rejects more than 24 hours', async () => {
    const unit = $<HTMLSelectElement>('unit');
    const interval = $<HTMLInputElement>('interval');
    unit.value = 'hours';
    await change(unit);
    interval.value = '25';
    await change(interval);

    expect($('cadence-error').textContent).toBe('cadenceTooLong');
  });
});
