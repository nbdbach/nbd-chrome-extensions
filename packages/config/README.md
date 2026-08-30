# @nbd/config

Shared configuration for extensions in this repo.

- `tsconfig.extension.json` — base TypeScript config for an extension. Extensions
  extend it with `"extends": "../../packages/config/tsconfig.extension.json"`.

Add to this package only when a second extension actually needs the same thing.
Speculative shared code is the fastest way to make this repo hard to work in.
