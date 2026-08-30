/**
 * The permission allowlist lives here, not in a review comment.
 *
 * Adding a permission means editing this test, which means saying why in the
 * PR. That is the point: an agent that quietly widens the extension's reach
 * gets a red build instead of a merge.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const manifest: Record<string, unknown> = JSON.parse(
  readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'),
);
const messages: Record<string, { message: string }> = JSON.parse(
  readFileSync(new URL('../_locales/en/messages.json', import.meta.url), 'utf8'),
);
const pkg: { version: string } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

/** The single-purpose sentence. Must match the store listing word for word. */
const SINGLE_PURPOSE = 'Automatically reload the current tab on a schedule you choose.';

const ALLOWED_PERMISSIONS = ['alarms', 'storage'];

describe('manifest invariants', () => {
  it('is Manifest V3', () => {
    expect(manifest.manifest_version).toBe(3);
  });

  it('requests exactly the allowlisted permissions', () => {
    expect(manifest.permissions).toEqual(ALLOWED_PERMISSIONS);
  });

  it('never requests "tabs", which would show "Read your browsing history"', () => {
    expect(manifest.permissions).not.toContain('tabs');
  });

  it('requests no host permissions', () => {
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.optional_host_permissions).toBeUndefined();
    expect(JSON.stringify(manifest)).not.toContain('<all_urls>');
  });

  it('injects no content scripts', () => {
    expect(manifest.content_scripts).toBeUndefined();
  });

  it('exposes nothing to web pages', () => {
    expect(manifest.externally_connectable).toBeUndefined();
    expect(manifest.web_accessible_resources).toBeUndefined();
  });

  it('runs the service worker as a module', () => {
    expect(manifest.background).toEqual({
      service_worker: 'background/service-worker.js',
      type: 'module',
    });
  });

  it('ships every icon size the store and toolbar need', () => {
    for (const size of ['16', '32', '48', '128']) {
      expect(manifest.icons).toHaveProperty(size);
    }
  });

  it('has a version Chrome accepts, matching package.json', () => {
    expect(manifest.version).toMatch(/^\d+(\.\d+){1,3}$/);
    expect(manifest.version).toBe(pkg.version);
  });
});

describe('single purpose consistency', () => {
  it('routes user-visible manifest strings through _locales', () => {
    expect(manifest.name).toBe('__MSG_extensionName__');
    expect(manifest.description).toBe('__MSG_extensionDescription__');
    expect(manifest.default_locale).toBe('en');
  });

  it('states the single purpose exactly as the store listing must', () => {
    expect(messages.extensionDescription?.message).toBe(SINGLE_PURPOSE);
  });

  it('keeps the store title within the 75 character limit', () => {
    const name = messages.extensionName?.message ?? '';
    expect(name).toBe('NBD Auto Refresh');
    expect(name.length).toBeLessThanOrEqual(75);
  });

  it('gives every message a non-empty string', () => {
    for (const [key, entry] of Object.entries(messages)) {
      expect(entry.message, `message "${key}"`).toBeTruthy();
    }
  });
});

describe('manifest paths resolve to real source files', () => {
  const icons = manifest.icons as Record<string, string>;

  it.each(Object.entries(icons))('icon %s has a source file', (_size, path) => {
    const name = path.replace(/^icons\//, '');
    expect(existsSync(new URL(`../public/icons/${name}`, import.meta.url))).toBe(true);
  });

  it('the popup page exists', () => {
    expect(existsSync(new URL('../src/popup/popup.html', import.meta.url))).toBe(true);
    expect(existsSync(new URL('../src/popup/popup.css', import.meta.url))).toBe(true);
  });

  it('the service worker entry point exists', () => {
    expect(existsSync(new URL('../src/background/service-worker.ts', import.meta.url))).toBe(true);
  });
});
