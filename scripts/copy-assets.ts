/**
 * Copy an extension's static files into dist/ after tsc has emitted the JS.
 *
 * There is no bundler: these extensions have no runtime dependencies, so
 * compiling and copying is the whole build. That keeps shipped code readable,
 * which is both a product promise and the fastest path through store review.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { extensionDir } from './extensions.js';

export interface AssetCopy {
  /** Path relative to the extension directory. */
  readonly from: string;
  /** Path relative to dist/. */
  readonly to: string;
}

/** Paths here must agree with manifest.json. The manifest test checks the rest. */
export const STATIC_ASSETS: readonly AssetCopy[] = [
  { from: 'manifest.json', to: 'manifest.json' },
  { from: '_locales', to: '_locales' },
  { from: 'public/icons', to: 'icons' },
  { from: 'src/popup/popup.html', to: 'popup/popup.html' },
  { from: 'src/popup/popup.css', to: 'popup/popup.css' },
];

/**
 * Explicit recursive copy rather than fs.cpSync: cpSync also copies file modes,
 * which fails with EACCES on some mounted filesystems. We only ever need the
 * bytes.
 */
function copyInto(source: string, destination: string): void {
  if (statSync(source).isDirectory()) {
    mkdirSync(destination, { recursive: true });
    for (const entry of readdirSync(source)) {
      copyInto(join(source, entry), join(destination, entry));
    }
    return;
  }
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
}

export interface CopyOptions {
  /** Repo root; injectable so this is testable against a fixture. */
  readonly root?: string;
  readonly assets?: readonly AssetCopy[];
}

export function copyAssets(name: string, options: CopyOptions = {}): void {
  const assets = options.assets ?? STATIC_ASSETS;
  const dir = options.root === undefined ? extensionDir(name) : extensionDir(name, options.root);
  const dist = join(dir, 'dist');

  if (!existsSync(dist)) {
    throw new Error(`No dist/ for ${name} — run tsc before copying assets.`);
  }

  for (const asset of assets) {
    const source = join(dir, asset.from);
    if (!existsSync(source)) {
      throw new Error(`Missing asset ${asset.from} in extensions/${name}`);
    }
    copyInto(source, join(dist, asset.to));
  }
}

function main(): void {
  const name = process.argv[2];
  if (!name) {
    console.error('Usage: tsx scripts/copy-assets.ts <extension-name>');
    process.exit(1);
  }
  copyAssets(name);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
