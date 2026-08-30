import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertValidExtensionName, extensionDir, repoRoot } from './extensions.js';

describe('extensionDir', () => {
  it('resolves under the repo by default', () => {
    expect(extensionDir('auto-refresh')).toBe(join(repoRoot, 'extensions', 'auto-refresh'));
  });

  it('accepts an injected root', () => {
    expect(extensionDir('demo', '/tmp/x')).toBe(join('/tmp/x', 'extensions', 'demo'));
  });

  it('validates before joining, so a name cannot escape the directory', () => {
    expect(() => extensionDir('../../etc')).toThrow(/Invalid extension name/);
  });
});

describe('assertValidExtensionName', () => {
  it('accepts a hyphenated lowercase name', () => {
    expect(() => assertValidExtensionName('auto-refresh')).not.toThrow();
  });
});
