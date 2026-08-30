# nbd-chrome-extensions

Small, unintrusive, open-source Chrome extensions.

Every extension here follows the same rules: minimum permissions, no network
requests, no analytics, and source you can read and build yourself to verify
against what is published on the Chrome Web Store.

## Extensions

| Extension    | Description | Store |
| ------------ | ----------- | ----- |
| _(none yet)_ |             |       |

## Development

Requires Node 22+.

```bash
npm install
npm run check
```

`npm run check` runs typecheck, lint, tests, and build — the same thing CI runs.

To load an extension in Chrome: build it, then open `chrome://extensions`,
enable Developer mode, and use "Load unpacked" on its `dist/` folder.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). If you are an AI agent, start with
[AGENTS.md](./AGENTS.md).

## License

MIT — see [LICENSE](./LICENSE).
