import { describe, expect, it } from 'vitest';
import {
  assertValidExtensionName,
  assertValidVersion,
  readManifestVersion,
  releaseFileName,
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
