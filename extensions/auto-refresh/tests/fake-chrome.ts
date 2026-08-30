/**
 * A small in-memory stand-in for the parts of the chrome API this extension
 * touches.
 *
 * Hand-written on purpose: it is the only way to assert what the service worker
 * *did* (which alarms exist, which tabs were reloaded, what the badge says)
 * rather than that it called a mock. Anything it cannot express — real service
 * worker termination, real alarm timing — belongs in the Playwright smoke test,
 * not here.
 */

type Listener = (...args: never[]) => unknown;

class FakeEvent<Args extends unknown[]> {
  private readonly listeners: ((...args: Args) => unknown)[] = [];

  addListener(listener: (...args: Args) => unknown): void {
    this.listeners.push(listener as Listener as (...args: Args) => unknown);
  }

  get listenerCount(): number {
    return this.listeners.length;
  }

  emit(...args: Args): void {
    for (const listener of [...this.listeners]) listener(...args);
  }
}

function createStorageArea() {
  const data = new Map<string, unknown>();
  return {
    data,
    get(key: string): Promise<Record<string, unknown>> {
      return Promise.resolve(data.has(key) ? { [key]: data.get(key) } : {});
    },
    set(items: Record<string, unknown>): Promise<void> {
      for (const [key, value] of Object.entries(items)) {
        // Structured-clone-ish: storage never hands back live references.
        data.set(key, JSON.parse(JSON.stringify(value)) as unknown);
      }
      return Promise.resolve();
    },
  };
}

export interface FakeAlarm {
  name: string;
  periodInMinutes?: number;
  delayInMinutes?: number;
}

export interface ReloadCall {
  tabId: number;
  bypassCache: boolean;
}

export function createFakeChrome(options: { openTabIds?: number[]; activeTabId?: number } = {}) {
  const openTabs = new Set<number>(options.openTabIds ?? []);
  const alarms = new Map<string, FakeAlarm>();
  const badges = new Map<number, string>();
  const reloads: ReloadCall[] = [];
  const unreloadable = new Set<number>();

  const onAlarm = new FakeEvent<[FakeAlarm]>();
  const onRemoved = new FakeEvent<[number]>();
  const onStartup = new FakeEvent<[]>();
  const onInstalled = new FakeEvent<[]>();

  type MessageListener = (
    message: unknown,
    sender: unknown,
    sendResponse: (response: unknown) => void,
  ) => unknown;
  const messageListeners: MessageListener[] = [];

  const session = createStorageArea();
  const local = createStorageArea();

  const api = {
    storage: { session, local },

    alarms: {
      all: alarms,
      create(name: string, info: { periodInMinutes?: number; delayInMinutes?: number }) {
        alarms.set(name, { name, ...info });
        return Promise.resolve();
      },
      clear(name: string) {
        return Promise.resolve(alarms.delete(name));
      },
      getAll() {
        return Promise.resolve([...alarms.values()]);
      },
      onAlarm,
    },

    tabs: {
      open: openTabs,
      reloads,
      query(queryInfo: { active?: boolean }) {
        if (queryInfo.active) {
          const id = options.activeTabId;
          return Promise.resolve(typeof id === 'number' ? [{ id }] : []);
        }
        return Promise.resolve([...openTabs].map((id) => ({ id })));
      },
      reload(tabId: number, info?: { bypassCache?: boolean }) {
        if (!openTabs.has(tabId) || unreloadable.has(tabId)) {
          return Promise.reject(new Error('No tab with id'));
        }
        reloads.push({ tabId, bypassCache: info?.bypassCache === true });
        return Promise.resolve();
      },
      onRemoved,
    },

    action: {
      badges,
      setBadgeText({ tabId, text }: { tabId: number; text: string }) {
        if (!openTabs.has(tabId)) return Promise.reject(new Error('No tab with id'));
        if (text === '') badges.delete(tabId);
        else badges.set(tabId, text);
        return Promise.resolve();
      },
      setBadgeBackgroundColor(_details: { tabId: number; color: string }) {
        return Promise.resolve();
      },
    },

    runtime: {
      onStartup,
      onInstalled,
      onMessage: {
        addListener(listener: MessageListener) {
          messageListeners.push(listener);
        },
      },
      sendMessage(message: unknown): Promise<unknown> {
        return new Promise((resolve) => {
          let answered = false;
          for (const listener of messageListeners) {
            const async = listener(message, {}, (response) => {
              answered = true;
              resolve(response);
            });
            if (async === true) return; // response will arrive later
          }
          if (!answered) resolve(undefined);
        });
      },
    },

    i18n: {
      // Deterministic and inspectable: tests assert on keys, not on English.
      getMessage(key: string, substitutions?: string[]): string {
        return substitutions?.length ? `${key}(${substitutions.join(',')})` : key;
      },
    },

    /** Test helpers, not part of the chrome API. */
    closeTab(tabId: number): void {
      openTabs.delete(tabId);
      onRemoved.emit(tabId);
    },
    breakReload(tabId: number): void {
      unreloadable.add(tabId);
    },
  };

  return api;
}

export type FakeChrome = ReturnType<typeof createFakeChrome>;

/** Install the fake as the global `chrome` the modules under test will see. */
export function installFakeChrome(fake: FakeChrome): void {
  (globalThis as { chrome?: unknown }).chrome = fake;
}
