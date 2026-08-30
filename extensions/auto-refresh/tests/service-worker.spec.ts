import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { alarmName } from '../src/lib/targets.js';
import { createFakeChrome, installFakeChrome, type FakeChrome } from './fake-chrome.js';

const TAB = 7;
let fake: FakeChrome;

/** Re-import per test so the worker registers listeners against a fresh fake. */
async function loadWorker(openTabIds: number[] = [TAB]): Promise<void> {
  fake = createFakeChrome({ openTabIds });
  installFakeChrome(fake);
  vi.resetModules();
  await import('../src/background/service-worker.js');
}

async function send(message: unknown): Promise<unknown> {
  return fake.runtime.sendMessage(message);
}

async function enable(tabId = TAB, cadenceSeconds = 60, bypassCache = false): Promise<unknown> {
  return send({ type: 'enable', tabId, cadenceSeconds, bypassCache });
}

beforeEach(async () => {
  await loadWorker();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('enabling a tab', () => {
  it('returns the resulting state', async () => {
    const state = await enable(TAB, 300, true);
    expect(state).toMatchObject({ enabled: true, cadenceSeconds: 300, bypassCache: true });
  });

  it('creates an alarm at the requested period', async () => {
    await enable(TAB, 300);
    expect(fake.alarms.all.get(alarmName(TAB))).toMatchObject({ periodInMinutes: 5 });
  });

  it('never creates an alarm below the 30 second floor Chrome honors', async () => {
    await enable(TAB, 1);
    const alarm = fake.alarms.all.get(alarmName(TAB));
    expect(alarm?.periodInMinutes).toBeGreaterThanOrEqual(0.5);
  });

  it('shows the badge', async () => {
    await enable();
    expect(fake.action.badges.get(TAB)).toBeTruthy();
  });

  it('survives a badge write for a tab that has just closed', async () => {
    fake.tabs.open.delete(TAB);
    await expect(enable()).resolves.toMatchObject({ enabled: true });
  });
});

describe('reading state', () => {
  it('is null before anything is enabled', async () => {
    await expect(send({ type: 'getState', tabId: TAB })).resolves.toBeNull();
  });

  it('reflects what was enabled', async () => {
    await enable(TAB, 120, true);
    await expect(send({ type: 'getState', tabId: TAB })).resolves.toMatchObject({
      enabled: true,
      cadenceSeconds: 120,
      bypassCache: true,
    });
  });

  it('is isolated per tab', async () => {
    await loadWorker([1, 2]);
    await enable(1);
    await expect(send({ type: 'getState', tabId: 2 })).resolves.toBeNull();
  });

  it('ignores messages that are not requests', async () => {
    await expect(send({ type: 'nonsense' })).resolves.toBeUndefined();
    await expect(send(null)).resolves.toBeUndefined();
    await expect(send({ type: 'enable' })).resolves.toBeUndefined();
  });
});

describe('disabling', () => {
  it('clears state, alarm and badge', async () => {
    await enable();
    await send({ type: 'disable', tabId: TAB });

    await expect(send({ type: 'getState', tabId: TAB })).resolves.toBeNull();
    expect(fake.alarms.all.has(alarmName(TAB))).toBe(false);
    expect(fake.action.badges.has(TAB)).toBe(false);
  });

  it('is safe on a tab that was never enabled', async () => {
    await expect(send({ type: 'disable', tabId: 999 })).resolves.toBeNull();
  });
});

describe('when an alarm fires', () => {
  it('reloads the tab', async () => {
    await enable();
    fake.alarms.onAlarm.emit({ name: alarmName(TAB) });
    await vi.waitFor(() => expect(fake.tabs.reloads).toHaveLength(1));
    expect(fake.tabs.reloads[0]).toEqual({ tabId: TAB, bypassCache: false });
  });

  it('honors bypassCache', async () => {
    await enable(TAB, 60, true);
    fake.alarms.onAlarm.emit({ name: alarmName(TAB) });
    await vi.waitFor(() => expect(fake.tabs.reloads[0]?.bypassCache).toBe(true));
  });

  it('pushes the countdown forward', async () => {
    await enable(TAB, 60);
    const before = (await send({ type: 'getState', tabId: TAB })) as { nextRefreshAt: number };
    await new Promise((resolve) => setTimeout(resolve, 5));

    fake.alarms.onAlarm.emit({ name: alarmName(TAB) });
    await vi.waitFor(async () => {
      const after = (await send({ type: 'getState', tabId: TAB })) as { nextRefreshAt: number };
      expect(after.nextRefreshAt).toBeGreaterThan(before.nextRefreshAt);
    });
  });

  it('clears an alarm that outlived its state instead of reloading', async () => {
    fake.alarms.all.set(alarmName(TAB), { name: alarmName(TAB), periodInMinutes: 1 });
    fake.alarms.onAlarm.emit({ name: alarmName(TAB) });

    await vi.waitFor(() => expect(fake.alarms.all.has(alarmName(TAB))).toBe(false));
    expect(fake.tabs.reloads).toHaveLength(0);
  });

  it('leaves alarms belonging to other code alone', async () => {
    fake.alarms.all.set('someone-else', { name: 'someone-else' });
    fake.alarms.onAlarm.emit({ name: 'someone-else' });

    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(fake.alarms.all.has('someone-else')).toBe(true);
    expect(fake.tabs.reloads).toHaveLength(0);
  });

  it('stops refreshing a tab that can no longer be reloaded', async () => {
    await enable();
    fake.breakReload(TAB);
    fake.alarms.onAlarm.emit({ name: alarmName(TAB) });

    await vi.waitFor(async () => {
      await expect(send({ type: 'getState', tabId: TAB })).resolves.toBeNull();
    });
    expect(fake.alarms.all.has(alarmName(TAB))).toBe(false);
  });
});

describe('when a tab closes', () => {
  it('drops the target and its alarm', async () => {
    await enable();
    fake.closeTab(TAB);

    await vi.waitFor(async () => {
      await expect(send({ type: 'getState', tabId: TAB })).resolves.toBeNull();
    });
    expect(fake.alarms.all.has(alarmName(TAB))).toBe(false);
  });
});

describe('reconciliation on startup', () => {
  it('drops targets whose tabs did not survive the restart', async () => {
    await loadWorker([1, 2]);
    await enable(1);
    await enable(2);

    // New session: different tab ids entirely, but the alarms persisted.
    fake.tabs.open.clear();
    fake.tabs.open.add(900);
    fake.runtime.onStartup.emit();

    await vi.waitFor(() => expect(fake.alarms.all.size).toBe(0));
    await expect(send({ type: 'getState', tabId: 1 })).resolves.toBeNull();
  });

  it('recreates an alarm for a target that survived without one', async () => {
    await enable(TAB, 120);
    fake.alarms.all.clear();
    fake.runtime.onStartup.emit();

    await vi.waitFor(() => expect(fake.alarms.all.has(alarmName(TAB))).toBe(true));
    expect(fake.alarms.all.get(alarmName(TAB))?.periodInMinutes).toBe(2);
  });

  it('clears an orphan alarm with no target behind it', async () => {
    fake.alarms.all.set(alarmName(42), { name: alarmName(42) });
    fake.runtime.onInstalled.emit();

    await vi.waitFor(() => expect(fake.alarms.all.has(alarmName(42))).toBe(false));
  });

  it('leaves a healthy pairing untouched', async () => {
    await enable(TAB, 60);
    fake.runtime.onStartup.emit();

    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(fake.alarms.all.has(alarmName(TAB))).toBe(true);
    await expect(send({ type: 'getState', tabId: TAB })).resolves.toMatchObject({ enabled: true });
  });
});

describe('storage is treated as untrusted', () => {
  it('ignores a malformed targets blob rather than crashing', async () => {
    await fake.storage.session.set({ targets: { nope: { tabId: 'x' } } });
    await expect(send({ type: 'getState', tabId: TAB })).resolves.toBeNull();
  });
});
