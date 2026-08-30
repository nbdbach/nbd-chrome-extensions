/**
 * Build an extension and zip it for Chrome Web Store upload.
 *
 * Usage: npm run package -- <extension-name>
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertValidExtensionName, extensionDir, repoRoot } from './extensions.js';

/** Release artifacts are named so the tag, the zip and the store version agree. */
export function releaseFileName(name: string, version: string): string {
  return `${name}-${version}.zip`;
}

/** Chrome requires a manifest version of 2 to 4 dot-separated integers. */
export function assertValidVersion(version: string): void {
  if (!/^\d+(\.\d+){1,3}$/.test(version)) {
    throw new Error(
      `Invalid manifest version "${version}". Chrome requires 2 to 4 dot-separated integers.`,
    );
  }
}

export function readManifestVersion(manifestJson: string): string {
  const parsed: unknown = JSON.parse(manifestJson);
  if (typeof parsed !== 'object' || parsed === null || !('version' in parsed)) {
    throw new Error('manifest.json has no "version" field.');
  }
  const { version } = parsed as { version: unknown };
  if (typeof version !== 'string') {
    throw new Error('manifest.json "version" must be a string.');
  }
  assertValidVersion(version);
  return version;
}

/**
 * npm resolves --workspace by package name or by path, never by directory name
 * alone. Exported so the shape is pinned by a test rather than discovered at
 * release time.
 */
export function buildArgs(name: string): readonly string[] {
  assertValidExtensionName(name);
  return ['run', 'build', '--workspace', `extensions/${name}`];
}

/**
 * Archives '.' — combined with a cwd of dist/, that puts the manifest at the
 * root of the zip. A zip containing the folder is rejected by the Web Store,
 * and the failure message does not explain why, so this shape is pinned.
 */
export function zipArgs(outFile: string): readonly string[] {
  return ['-r', '-q', '-X', outFile, '.'];
}

export interface PackageOptions {
  readonly root?: string;
  readonly runBuild?: (name: string, root: string) => void;
}

function npmBuild(name: string, root: string): void {
  execFileSync('npm', [...buildArgs(name)], { cwd: root, stdio: 'inherit' });
}

/** Returns the path of the zip that was written. */
export function packageExtension(name: string, options: PackageOptions = {}): string {
  const root = options.root ?? repoRoot;
  const runBuild = options.runBuild ?? npmBuild;

  const dir = extensionDir(name, root);
  if (!existsSync(dir)) {
    throw new Error(`No extension at extensions/${name}`);
  }

  runBuild(name, root);

  const distDir = join(dir, 'dist');
  const manifestPath = join(distDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`Build produced no manifest at extensions/${name}/dist/manifest.json`);
  }

  const version = readManifestVersion(readFileSync(manifestPath, 'utf8'));
  const releasesDir = join(root, 'releases');
  mkdirSync(releasesDir, { recursive: true });

  const outFile = join(releasesDir, releaseFileName(name, version));
  rmSync(outFile, { force: true });
  execFileSync('zip', [...zipArgs(outFile)], { cwd: distDir, stdio: 'inherit' });

  return outFile;
}

function main(): void {
  const name = process.argv[2];
  if (!name) {
    console.error('Usage: npm run package -- <extension-name>');
    process.exit(1);
  }
  const outFile = packageExtension(name);
  console.log(`Packaged ${name} -> ${relative(repoRoot, outFile)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
