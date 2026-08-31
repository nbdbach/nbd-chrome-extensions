/**
 * Release tags carry the version that the store will display, and nothing
 * previously checked that the packaged manifest agreed with them. Tagging a
 * commit whose manifest was never bumped produced a build labelled with the
 * old version — silently, and only visible once it reached the listing.
 *
 * The logic lives here rather than in workflow YAML so it can be unit tested
 * and run locally, per AGENTS.md: no CI step without a local equivalent.
 *
 * Usage:
 *   tsx scripts/release-tag.ts parse  <tag>                    # emits name= and version=
 *   tsx scripts/release-tag.ts verify <tag> <manifest-path>    # exits non-zero on mismatch
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { assertValidExtensionName } from './extensions.js';

export interface ReleaseTag {
  readonly name: string;
  readonly version: string;
}

/** Tags are `<extension-name>@<version>`, e.g. auto-refresh@1.1.0. */
export function parseReleaseTag(tag: string): ReleaseTag {
  const at = tag.lastIndexOf('@');
  if (at <= 0 || at === tag.length - 1) {
    throw new Error(`Invalid release tag "${tag}". Expected <extension-name>@<version>.`);
  }

  const name = tag.slice(0, at);
  const version = tag.slice(at + 1);
  assertValidExtensionName(name);

  if (!/^\d+(\.\d+){1,3}$/.test(version)) {
    throw new Error(
      `Invalid version "${version}" in tag "${tag}". Chrome requires 2 to 4 dot-separated integers.`,
    );
  }

  return { name, version };
}

export function readVersion(manifestJson: string): string {
  const parsed: unknown = JSON.parse(manifestJson);
  if (typeof parsed !== 'object' || parsed === null || !('version' in parsed)) {
    throw new Error('manifest.json has no "version" field.');
  }
  const { version } = parsed as { version: unknown };
  if (typeof version !== 'string') throw new Error('manifest.json "version" must be a string.');
  return version;
}

/** The check that matters: the artifact says what the tag says. */
export function assertVersionMatchesTag(tag: string, manifestVersion: string): ReleaseTag {
  const parsed = parseReleaseTag(tag);
  if (parsed.version !== manifestVersion) {
    throw new Error(
      `Tag ${tag} does not match the packaged manifest version ${manifestVersion}. ` +
        `Bump the manifest to ${parsed.version} (or re-tag as ${parsed.name}@${manifestVersion}) ` +
        `— publishing this would label the build with the wrong version in the store.`,
    );
  }
  return parsed;
}

function main(): void {
  const [command, tag, manifestPath] = process.argv.slice(2);

  if (command === 'parse' && tag) {
    const { name, version } = parseReleaseTag(tag);
    // Shaped for GITHUB_OUTPUT.
    console.log(`name=${name}`);
    console.log(`version=${version}`);
    return;
  }

  if (command === 'verify' && tag && manifestPath) {
    const { version } = assertVersionMatchesTag(
      tag,
      readVersion(readFileSync(manifestPath, 'utf8')),
    );
    console.log(`Tag and packaged manifest agree on ${version}.`);
    return;
  }

  console.error('Usage: release-tag.ts parse <tag> | verify <tag> <manifest-path>');
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
