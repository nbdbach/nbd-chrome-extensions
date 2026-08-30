import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assertValidExtensionName } from './extensions.js';
import {
  assertValidVersion,
  buildArgs,
  packageExtension,
  readManifestVersion,
  releaseFileName,
  zipArgs,
} from './package.js';

describe('assertValidExtensionName', () => {
  it('accepts lowercase hyphenated names', () => {
    expect(() => assertValidExtensionName('auto-refresh')).not.toThrow();
  });

  it.each(['Auto-Refresh', '1auto', 'auto_refresh', '', 'auto refresh', '../escape'])(
    'rejects %o',
    (name) => {
      expect(() => assertValidExtensionName(name)).toThrow(/Invalid extension name/);
    },
  );
});

describe('assertValidVersion', () => {
  it.each(['1.0', '1.0.0', '1.2.3.4'])('accepts %o', (version) => {
    expect(() => assertValidVersion(version)).not.toThrow();
  });

  it.each(['1', '1.0.0.0.0', '1.0.0-beta', 'v1.0.0', ''])('rejects %o', (version) => {
    expect(() => assertValidVersion(version)).toThrow(/Invalid manifest version/);
  });
});

describe('releaseFileName', () => {
  it('lines up with the release tag format', () => {
    expect(releaseFileName('auto-refresh', '1.0.0')).toBe('auto-refresh-1.0.0.zip');
  });
});

describe('readManifestVersion', () => {
  it('reads a valid version', () => {
    expect(readManifestVersion('{"version":"1.2.3"}')).toBe('1.2.3');
  });

  it('rejects a missing version', () => {
    expect(() => readManifestVersion('{}')).toThrow(/no "version" field/);
  });

  it('rejects a non-string version', () => {
    expect(() => readManifestVersion('{"version":3}')).toThrow(/must be a string/);
  });

  it('rejects a malformed version', () => {
    expect(() => readManifestVersion('{"version":"1.0.0-beta"}')).toThrow(
      /Invalid manifest version/,
    );
  });
});

describe('buildArgs', () => {
  it('addresses the workspace by path, not by bare directory name', () => {
    // npm cannot resolve --workspace auto-refresh; it needs the path or the
    // package name. Getting this wrong only shows up at release time.
    expect(buildArgs('auto-refresh')).toEqual([
      'run',
      'build',
      '--workspace',
      'extensions/auto-refresh',
    ]);
  });

  it('refuses a name that could escape the extensions directory', () => {
    expect(() => buildArgs('../evil')).toThrow(/Invalid extension name/);
  });
});

describe('zipArgs', () => {
  it('archives the contents rather than the folder', () => {
    // '.' with a cwd of dist/ is what keeps manifest.json at the zip root.
    expect(zipArgs('/tmp/out.zip')).toEqual(['-r', '-q', '-X', '/tmp/out.zip', '.']);
  });
});

describe('packageExtension', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'nbd-pkg-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function scaffold(version = '1.2.3'): void {
    mkdirSync(join(root, 'extensions', 'demo', 'dist'), { recursive: true });
    writeFileSync(
      join(root, 'extensions', 'demo', 'dist', 'manifest.json'),
      JSON.stringify({ version }),
    );
  }

  it('writes a zip named after the manifest version', () => {
    scaffold('2.0.1');
    const out = packageExtension('demo', { root, runBuild: () => undefined });

    expect(out).toBe(join(root, 'releases', 'demo-2.0.1.zip'));
    expect(existsSync(out)).toBe(true);
    expect(statSync(out).size).toBeGreaterThan(0);
  });

  it('builds before packaging', () => {
    scaffold();
    const calls: string[] = [];
    packageExtension('demo', { root, runBuild: (name) => calls.push(name) });
    expect(calls).toEqual(['demo']);
  });

  it('fails clearly when the extension does not exist', () => {
    expect(() => packageExtension('missing', { root, runBuild: () => undefined })).toThrow(
      /No extension at extensions\/missing/,
    );
  });

  it('fails clearly when the build produced nothing', () => {
    mkdirSync(join(root, 'extensions', 'demo'), { recursive: true });
    expect(() => packageExtension('demo', { root, runBuild: () => undefined })).toThrow(
      /produced no manifest/,
    );
  });

  it('refuses a manifest version Chrome would reject', () => {
    scaffold('1.0.0-beta');
    expect(() => packageExtension('demo', { root, runBuild: () => undefined })).toThrow(
      /Invalid manifest version/,
    );
  });

  it('overwrites a stale zip from a previous run', () => {
    scaffold('2.0.1');
    const first = packageExtension('demo', { root, runBuild: () => undefined });
    writeFileSync(first, 'stale');
    const second = packageExtension('demo', { root, runBuild: () => undefined });
    expect(readFileSync(second).subarray(0, 2).toString()).toBe('PK');
  });
});
