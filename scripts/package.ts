/**
 * Build an extension and zip it for Chrome Web Store upload.
 *
 * Usage: npm run package -- <extension-name>
 *
 * The Web Store expects a zip of the *contents* of the build output, not a zip
 * containing the folder. Getting this wrong produces a confusing rejection, so
 * it is enforced here rather than left to whoever is doing the upload.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Extension names are used as directory names and in zip filenames. */
export function assertValidExtensionName(name: string): void {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new Error(
      `Invalid extension name "${name}". Use lowercase letters, digits and hyphens, starting with a letter.`,
    );
  }
}

/** Release artifacts are named so the tag, the zip and the store version line up. */
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

function main(): void {
  const name = process.argv[2];
  if (!name) {
    console.error('Usage: npm run package -- <extension-name>');
    process.exit(1);
  }
  assertValidExtensionName(name);

  const extensionDir = join(repoRoot, 'extensions', name);
  if (!existsSync(extensionDir)) {
    throw new Error(`No extension at extensions/${name}`);
  }

  execFileSync('npm', ['run', 'build', '--workspace', name], {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  const distDir = join(extensionDir, 'dist');
  const manifestPath = join(distDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`Build produced no manifest at extensions/${name}/dist/manifest.json`);
  }

  const version = readManifestVersion(readFileSync(manifestPath, 'utf8'));
  const releasesDir = join(repoRoot, 'releases');
  mkdirSync(releasesDir, { recursive: true });

  const outFile = join(releasesDir, releaseFileName(name, version));
  rmSync(outFile, { force: true });

  // Run from inside dist/ so the archive contains the contents, not the folder.
  execFileSync('zip', ['-r', '-q', '-X', outFile, '.'], { cwd: distDir, stdio: 'inherit' });

  console.log(`Packaged ${name} ${version} -> releases/${releaseFileName(name, version)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
