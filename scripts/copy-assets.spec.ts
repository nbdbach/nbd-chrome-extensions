import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { STATIC_ASSETS, copyAssets } from './copy-assets.js';

let root: string;
let extension: string;

/** A miniature repo on disk, so the copier is exercised for real. */
function scaffold(options: { withDist?: boolean; withIcons?: boolean } = {}): void {
  const { withDist = true, withIcons = true } = options;
  mkdirSync(join(extension, '_locales', 'en'), { recursive: true });
  mkdirSync(join(extension, 'src', 'popup'), { recursive: true });
  if (withIcons) {
    mkdirSync(join(extension, 'public', 'icons'), { recursive: true });
    writeFileSync(join(extension, 'public', 'icons', 'icon-16.png'), 'png');
  }
  if (withDist) mkdirSync(join(extension, 'dist'), { recursive: true });

  writeFileSync(join(extension, 'manifest.json'), '{"version":"1.0.0"}');
  writeFileSync(join(extension, '_locales', 'en', 'messages.json'), '{}');
  writeFileSync(join(extension, 'src', 'popup', 'popup.html'), '<html></html>');
  writeFileSync(join(extension, 'src', 'popup', 'popup.css'), 'body{}');
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'nbd-copy-'));
  extension = join(root, 'extensions', 'demo');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('copyAssets', () => {
  it('lands every asset at the path the manifest expects', () => {
    scaffold();
    copyAssets('demo', { root });

    const dist = join(extension, 'dist');
    expect(existsSync(join(dist, 'manifest.json'))).toBe(true);
    expect(existsSync(join(dist, '_locales', 'en', 'messages.json'))).toBe(true);
    expect(existsSync(join(dist, 'icons', 'icon-16.png'))).toBe(true);
    expect(existsSync(join(dist, 'popup', 'popup.html'))).toBe(true);
    expect(existsSync(join(dist, 'popup', 'popup.css'))).toBe(true);
  });

  it('copies contents, not just directory entries', () => {
    scaffold();
    copyAssets('demo', { root });
    expect(readFileSync(join(extension, 'dist', 'popup', 'popup.html'), 'utf8')).toBe(
      '<html></html>',
    );
  });

  it('refuses to run before tsc has produced dist/', () => {
    scaffold({ withDist: false });
    expect(() => copyAssets('demo', { root })).toThrow(/run tsc before copying/);
  });

  it('names the missing asset rather than half-copying', () => {
    scaffold({ withIcons: false });
    expect(() => copyAssets('demo', { root })).toThrow(/Missing asset public\/icons/);
  });

  it('rejects a name that could escape the extensions directory', () => {
    expect(() => copyAssets('../evil', { root })).toThrow(/Invalid extension name/);
  });

  it('copies only what it is told to', () => {
    scaffold();
    copyAssets('demo', { root, assets: [{ from: 'manifest.json', to: 'manifest.json' }] });
    expect(existsSync(join(extension, 'dist', 'manifest.json'))).toBe(true);
    expect(existsSync(join(extension, 'dist', 'popup', 'popup.html'))).toBe(false);
  });
});

describe('STATIC_ASSETS', () => {
  it('puts the manifest at the root of the build, where Chrome looks', () => {
    expect(STATIC_ASSETS).toContainEqual({ from: 'manifest.json', to: 'manifest.json' });
  });

  it('flattens public/icons to icons/, matching the manifest paths', () => {
    expect(STATIC_ASSETS).toContainEqual({ from: 'public/icons', to: 'icons' });
  });
});
