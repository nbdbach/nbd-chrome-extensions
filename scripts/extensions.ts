import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Extension names are directory names and appear in zip filenames and tags. */
export function assertValidExtensionName(name: string): void {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new Error(
      `Invalid extension name "${name}". Use lowercase letters, digits and hyphens, starting with a letter.`,
    );
  }
}

/** `root` is injectable so the build scripts can be tested against a fixture. */
export function extensionDir(name: string, root: string = repoRoot): string {
  assertValidExtensionName(name);
  return join(root, 'extensions', name);
}
