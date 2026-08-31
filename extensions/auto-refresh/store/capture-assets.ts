/**
 * Generate the Chrome Web Store listing images from the real extension.
 *
 * Run:  npm run store:assets
 *
 * Screenshots must be exactly 1280x800 and the small promo tile exactly
 * 440x280, so the popup is captured at 2x and then composed onto a frame
 * rendered at device scale 1. Generating rather than hand-editing means the
 * assets can be regenerated the moment the popup changes, which is the only
 * way listing images stay honest.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const extensionPath = resolve(here, '..', 'dist');
const outDir = join(here, 'assets');

const FONTS = `system-ui, 'Inter', 'Liberation Sans', 'Carlito', 'DejaVu Sans', sans-serif`;

interface Shot {
  readonly name: string;
  readonly headline: string;
  readonly sub: string;
  /** Which popup state to photograph. */
  readonly state: 'off' | 'running' | 'notice';
}

const SHOTS: readonly Shot[] = [
  {
    name: '1-per-tab',
    state: 'off',
    headline: 'Auto refresh, one tab at a time',
    sub: 'Turn it on for the tab you are watching. Every other tab is left alone.',
  },
  {
    name: '2-cadence',
    state: 'running',
    headline: 'Any interval, 30 seconds to 24 hours',
    sub: 'Type a number, pick a unit, and see exactly when the next reload lands.',
  },
  {
    name: '3-no-surprises',
    state: 'notice',
    headline: 'It tells you before it costs you',
    sub: 'Reloading discards anything typed into the page, so it says so — once.',
  },
  {
    name: '4-permissions',
    state: 'off',
    headline: 'Permissions requested: alarms, storage',
    sub: 'No host access. No content scripts. No network requests. No analytics.',
  },
];

function dataUri(png: Buffer): string {
  return `data:image/png;base64,${png.toString('base64')}`;
}

async function setPrefs(popup: Page, seenWarning: boolean): Promise<void> {
  await popup.evaluate(async (seen) => {
    await chrome.storage.local.set({
      prefs: { cadenceSeconds: 300, bypassCache: false, seenFormDataWarning: seen },
    });
  }, seenWarning);
}

async function capturePopup(
  context: BrowserContext,
  extensionId: string,
  state: Shot['state'],
): Promise<Buffer> {
  const target = await context.newPage();
  await target.goto('about:blank');

  const popup = await context.newPage();
  const popupUrl = `chrome-extension://${extensionId}/popup/popup.html`;
  await popup.goto(popupUrl);
  await setPrefs(popup, state !== 'notice');

  // Reload while the page under test is active, so the popup binds to it the
  // way a real action popup would.
  await target.bringToFront();
  await popup.reload();
  await popup.locator('#enabled-label').waitFor();

  if (state !== 'off') {
    await popup.locator('#enabled').check();
    await popup.locator('#status').filter({ hasText: 'Next refresh' }).waitFor();
  }
  if (state === 'notice') {
    await popup.locator('#notice').waitFor({ state: 'visible' });
  }

  const shot = await popup.locator('body').screenshot();
  await popup.close();
  await target.close();
  return shot;
}

function frameHtml(shot: Shot, popupUri: string): string {
  return `<!doctype html><meta charset="utf-8"><style>
    * { box-sizing: border-box; margin: 0; }
    body {
      width: 1280px; height: 800px; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 36px;
      background: linear-gradient(160deg, #f2f6f3 0%, #e4ebe6 100%);
      font-family: ${FONTS}; color: #16241d; padding: 64px;
    }
    h1 { font-size: 42px; line-height: 1.15; font-weight: 650; letter-spacing: -0.02em; text-align: center; max-width: 900px; }
    p { font-size: 21px; line-height: 1.45; color: #4d6058; text-align: center; max-width: 720px; }
    .shot { border-radius: 14px; box-shadow: 0 28px 60px rgba(20, 45, 33, 0.22), 0 2px 6px rgba(20, 45, 33, 0.12); overflow: hidden; }
    /* Tall states (the first-run notice) scale down rather than clip. */
    .shot img { display: block; width: auto; height: auto; max-width: 520px; max-height: 470px; }
    .mark { position: absolute; bottom: 34px; font-size: 15px; color: #6b7f76; letter-spacing: 0.02em; }
  </style>
  <h1>${shot.headline}</h1>
  <p>${shot.sub}</p>
  <div class="shot"><img src="${popupUri}" alt=""></div>
  <div class="mark">NBD Auto Refresh — open source, MIT</div>`;
}

function tileHtml(iconUri: string): string {
  return `<!doctype html><meta charset="utf-8"><style>
    * { box-sizing: border-box; margin: 0; }
    body {
      width: 440px; height: 280px; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 14px;
      background: linear-gradient(160deg, #2f6f4f 0%, #1f4a36 100%);
      font-family: ${FONTS}; color: #ffffff;
    }
    img { width: 76px; height: 76px; }
    h1 { font-size: 30px; font-weight: 650; letter-spacing: -0.01em; }
    p { font-size: 15px; color: #cfe4d8; }
  </style>
  <img src="${iconUri}" alt="">
  <h1>NBD Auto Refresh</h1>
  <p>No permissions. No network. No fuss.</p>`;
}

async function render(
  browser: Browser,
  html: string,
  width: number,
  height: number,
): Promise<Buffer> {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(html);
  await page.waitForLoadState('networkidle');
  const shot = await page.screenshot({ clip: { x: 0, y: 0, width, height } });
  await page.close();
  return shot;
}

async function main(): Promise<void> {
  mkdirSync(outDir, { recursive: true });
  const executablePath = process.env.CHROMIUM_PATH;
  const launch = executablePath ? { executablePath } : { channel: 'chromium' as const };

  // Device scale 2 so the popup stays crisp when composed at 520px wide.
  const context = await chromium.launchPersistentContext('', {
    ...launch,
    deviceScaleFactor: 2,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });

  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const extensionId = worker.url().split('/')[2] ?? '';

  const popups = new Map<Shot['state'], string>();
  for (const state of ['off', 'running', 'notice'] as const) {
    popups.set(state, dataUri(await capturePopup(context, extensionId, state)));
  }
  await context.close();

  const browser = await chromium.launch(launch);
  for (const shot of SHOTS) {
    const png = await render(browser, frameHtml(shot, popups.get(shot.state) ?? ''), 1280, 800);
    writeFileSync(join(outDir, `screenshot-${shot.name}.png`), png);
    console.log(`wrote store/assets/screenshot-${shot.name}.png (1280x800)`);
  }

  const iconUri = dataUri(readFileSync(join(here, '..', 'public', 'icons', 'icon-128.png')));
  writeFileSync(
    join(outDir, 'promo-tile-440x280.png'),
    await render(browser, tileHtml(iconUri), 440, 280),
  );
  console.log('wrote store/assets/promo-tile-440x280.png (440x280)');

  await browser.close();
}

await main();
