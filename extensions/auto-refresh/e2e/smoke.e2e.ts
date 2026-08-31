/**
 * What only a real browser can prove.
 *
 * The unit tests drive the service worker and popup against an in-memory fake,
 * which cannot show that Chrome accepts the manifest, that _locales actually
 * resolve, or that chrome.alarms honours the period we ask for. That is what
 * this file is for. It deliberately does not re-test logic already covered by
 * the unit tests.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
// Playwright models a service worker as a Worker; alias it to avoid colliding
// with the DOM Worker type that the extension tsconfig also pulls in.
import type { BrowserContext, Page, Worker as PlaywrightWorker } from '@playwright/test';
import { expect, test } from './fixtures.js';

/**
 * Counts its own hits, so "did the tab actually reload" is directly countable.
 *
 * Only '/' is counted: Chrome also requests /favicon.ico, and counting that
 * made the hit count race with the assertion.
 */
function startCountingServer(): Promise<{ url: string; hits: () => number; close: () => void }> {
  let hits = 0;
  const server: Server = createServer((request, response) => {
    if (request.url !== '/') {
      response.writeHead(404).end();
      return;
    }
    hits += 1;
    response.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
    response.end('<!doctype html><title>target</title><p>target page</p>');
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}/`,
        hits: () => hits,
        close: () => server.close(),
      });
    });
  });
}

/**
 * A real action popup is not a tab, so chrome.tabs.query({active, currentWindow})
 * resolves to the page the user is looking at. Playwright can only open the
 * popup as a tab, which would otherwise make the popup its own target. Opening
 * it, re-activating the page, then reloading the popup reproduces production
 * behaviour: the popup initialises while the page under test is the active tab.
 */
async function openPopupFor(
  context: BrowserContext,
  extensionId: string,
  target: Page,
): Promise<Page> {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await target.bringToFront();
  await popup.reload();
  await popup.locator('#enabled-label').waitFor();
  return popup;
}

function alarmNames(worker: PlaywrightWorker): Promise<string[]> {
  return worker.evaluate(async () => {
    const alarms = await chrome.alarms.getAll();
    return alarms.map((alarm) => alarm.name);
  });
}

test('loads as an unpacked extension and starts its service worker', async ({
  context,
  extensionId,
}) => {
  expect(extensionId).toMatch(/^[a-p]{32}$/);
  expect(context.serviceWorkers()).toHaveLength(1);
});

test('resolves its UI strings through _locales in a real browser', async ({
  context,
  extensionId,
}) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);

  // The unit tests stub i18n, so this is the only place __MSG__ lookups and the
  // messages.json placeholders are actually exercised.
  await expect(popup.locator('#enabled-label')).toHaveText('Auto refresh this tab');
  await expect(popup.locator('#cadence-label')).toHaveText('Refresh every');
  await expect(popup.locator('#status')).toHaveText('Off');
  await expect(popup.locator('#unit option')).toHaveText(['seconds', 'minutes', 'hours']);
});

test('enabling schedules an alarm Chrome accepts at the production floor', async ({
  context,
  extensionId,
}) => {
  const site = await startCountingServer();
  try {
    const target = await context.newPage();
    await target.goto(site.url);

    const popup = await openPopupFor(context, extensionId, target);
    await popup.locator('#unit').selectOption('seconds');
    await popup.locator('#interval').fill('30');
    await popup.locator('#interval').blur();
    await popup.locator('#enabled').check();

    const worker = context.serviceWorkers()[0]!;
    await expect.poll(() => alarmNames(worker)).toHaveLength(1);

    // Chrome silently ignores periods under 0.5 in a packed build. Assert the
    // value we actually handed the real API, not the one we intended.
    const period = await worker.evaluate(async () => {
      const [alarm] = await chrome.alarms.getAll();
      return alarm?.periodInMinutes ?? 0;
    });
    expect(period).toBeGreaterThanOrEqual(0.5);
  } finally {
    site.close();
  }
});

test('a firing alarm actually reloads the tab', async ({ context, extensionId }) => {
  const site = await startCountingServer();
  try {
    const target = await context.newPage();
    await target.goto(site.url);
    expect(site.hits()).toBe(1);

    const popup = await openPopupFor(context, extensionId, target);
    await popup.locator('#enabled').check();

    const worker = context.serviceWorkers()[0]!;
    await expect.poll(() => alarmNames(worker)).toHaveLength(1);

    // Unpacked builds have no alarm floor, so re-arm the same alarm to fire
    // immediately rather than making the suite wait 30 real seconds. The floor
    // itself is asserted in the test above.
    await worker.evaluate(async () => {
      const [alarm] = await chrome.alarms.getAll();
      if (alarm) await chrome.alarms.create(alarm.name, { delayInMinutes: 0.02 });
    });

    await expect.poll(() => site.hits(), { timeout: 15_000 }).toBeGreaterThan(1);
  } finally {
    site.close();
  }
});

test('disabling clears the alarm', async ({ context, extensionId }) => {
  const site = await startCountingServer();
  try {
    const target = await context.newPage();
    await target.goto(site.url);

    const popup = await openPopupFor(context, extensionId, target);
    await popup.locator('#enabled').check();

    const worker = context.serviceWorkers()[0]!;
    await expect.poll(() => alarmNames(worker)).toHaveLength(1);

    await popup.locator('#enabled').uncheck();
    await expect.poll(() => alarmNames(worker)).toHaveLength(0);
    await expect(popup.locator('#status')).toHaveText('Off');
  } finally {
    site.close();
  }
});

test('closing the tab stops refreshing it', async ({ context, extensionId }) => {
  const site = await startCountingServer();
  try {
    const target = await context.newPage();
    await target.goto(site.url);

    const popup = await openPopupFor(context, extensionId, target);
    await popup.locator('#enabled').check();

    const worker = context.serviceWorkers()[0]!;
    await expect.poll(() => alarmNames(worker)).toHaveLength(1);

    await target.close();
    await expect.poll(() => alarmNames(worker)).toHaveLength(0);
  } finally {
    site.close();
  }
});

test('an interval below the floor is refused in a real browser', async ({
  context,
  extensionId,
}) => {
  const site = await startCountingServer();
  try {
    const target = await context.newPage();
    await target.goto(site.url);

    const popup = await openPopupFor(context, extensionId, target);
    await popup.locator('#unit').selectOption('seconds');
    await popup.locator('#interval').fill('10');
    await popup.locator('#interval').blur();

    await expect(popup.locator('#cadence-error')).toBeVisible();

    // The toggle is refused outright rather than flipping and snapping back.
    await expect(popup.locator('#enabled')).toBeDisabled();
    expect(await alarmNames(context.serviceWorkers()[0]!)).toHaveLength(0);

    await popup.locator('#interval').fill('45');
    await popup.locator('#interval').blur();
    await expect(popup.locator('#enabled')).toBeEnabled();
  } finally {
    site.close();
  }
});
