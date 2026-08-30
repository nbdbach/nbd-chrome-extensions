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

  it('offers every preset cadence, labelled by its largest unit', () => {
    const options = [...$<HTMLSelectElement>('cadence').options];
    expect(options.map((option) => option.value)).toEqual([
      '30',
      '60',
      '120',
      '300',
      '600',
      '900',
      '1800',
      '3600',
    ]);
    expect(options[0]?.textContent).toBe('cadenceSeconds(30)');
    expect(options[3]?.textContent).toBe('cadenceMinutes(5)');
    expect(options[7]?.textContent).toBe('cadenceHours(1)');
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
    expect($<HTMLSelectElement>('cadence').disabled).toBe(true);
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

    const select = $<HTMLSelectElement>('cadence');
    select.value = '300';
    await change(select);

    expect(fake.alarms.all.get('refresh:7')?.periodInMinutes).toBe(5);
  });

  it('is remembered for the next tab even while off', async () => {
    const select = $<HTMLSelectElement>('cadence');
    select.value = '900';
    await change(select);

    expect(fake.storage.local.data.get('prefs')).toMatchObject({ cadenceSeconds: 900 });
    expect(fake.alarms.all.size).toBe(0);
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
