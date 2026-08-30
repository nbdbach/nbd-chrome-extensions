import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as base, chromium, type BrowserContext } from '@playwright/test';

const extensionPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

/**
 * Extensions load only into a persistent context, and Manifest V3 exposes the
 * extension id through its service worker rather than any API.
 *
 * CHROMIUM_PATH is an escape hatch for environments that already have a
 * Chromium build and cannot download Playwright's (some CI images, locked-down
 * networks). Unset, Playwright uses its own.
 */
export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  // Playwright reads the destructured names to work out which fixtures this one
  // depends on; an empty pattern is the documented way to declare none.
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const executablePath = process.env.CHROMIUM_PATH;
    const context = await chromium.launchPersistentContext('', {
      ...(executablePath ? { executablePath } : { channel: 'chromium' }),
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    await use(context);
    await context.close();
  },

  extensionId: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await use(worker.url().split('/')[2] ?? '');
  },
});

export { expect } from '@playwright/test';
