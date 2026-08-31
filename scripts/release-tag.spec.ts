import { describe, expect, it } from 'vitest';
import { assertVersionMatchesTag, parseReleaseTag, readVersion } from './release-tag.js';

describe('parseReleaseTag', () => {
  it('splits a well-formed tag', () => {
    expect(parseReleaseTag('auto-refresh@1.1.0')).toEqual({
      name: 'auto-refresh',
      version: '1.1.0',
    });
  });

  it('accepts the version shapes Chrome allows', () => {
    for (const version of ['1.0', '1.0.0', '1.2.3.4']) {
      expect(parseReleaseTag(`auto-refresh@${version}`).version).toBe(version);
    }
  });

  it.each([
    'auto-refresh',
    '@1.0.0',
    'auto-refresh@',
    'auto-refresh@v1.0.0',
    'auto-refresh@1',
    'auto-refresh@1.0.0-beta',
  ])('rejects %o', (tag) => {
    expect(() => parseReleaseTag(tag)).toThrow(/Invalid (release tag|version)/);
  });

  it('rejects a name that is not a valid extension name', () => {
    expect(() => parseReleaseTag('Auto-Refresh@1.0.0')).toThrow(/Invalid extension name/);
    expect(() => parseReleaseTag('../evil@1.0.0')).toThrow(/Invalid extension name/);
  });
});

describe('readVersion', () => {
  it('reads the version out of a manifest', () => {
    expect(readVersion('{"version":"1.1.0"}')).toBe('1.1.0');
  });

  it('rejects a manifest with no usable version', () => {
    expect(() => readVersion('{}')).toThrow(/no "version" field/);
    expect(() => readVersion('{"version":3}')).toThrow(/must be a string/);
  });
});

describe('assertVersionMatchesTag', () => {
  it('passes when the artifact says what the tag says', () => {
    expect(assertVersionMatchesTag('auto-refresh@1.1.0', '1.1.0')).toEqual({
      name: 'auto-refresh',
      version: '1.1.0',
    });
  });

  it('catches the mistake this exists for: tagging a commit that was never bumped', () => {
    // Exactly what happened on main: the feature landed, the bump did not, and
    // the tag would have published a 1.1.0 release labelled 1.0.0.
    expect(() => assertVersionMatchesTag('auto-refresh@1.1.0', '1.0.0')).toThrow(
      /does not match the packaged manifest version 1\.0\.0/,
    );
  });

  it('explains both ways out in the error', () => {
    expect(() => assertVersionMatchesTag('auto-refresh@2.0.0', '1.1.0')).toThrow(
      /Bump the manifest to 2\.0\.0 \(or re-tag as auto-refresh@1\.1\.0\)/,
    );
  });

  it('still validates the tag itself', () => {
    expect(() => assertVersionMatchesTag('nonsense', '1.0.0')).toThrow(/Invalid release tag/);
  });
});
