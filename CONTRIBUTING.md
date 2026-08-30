# Contributing

Thanks for looking. This repo aims to stay small and easy to audit, so changes
are held to the invariants in [AGENTS.md](./AGENTS.md).

## Setup

```bash
npm install
npm run check
```

Node 22+ required.

## Before opening a PR

- `npm run check` passes, including the 80% coverage threshold.
- New behavior has a test that fails without your change.
- User-visible strings are in `_locales`, not inline.
- Your PR describes how you verified the change.

## Things that need an ADR first

Open an issue before writing code if your change would:

- add a permission, especially a host permission
- add a runtime dependency
- introduce a network request
- change an extension's stated single purpose

These affect Chrome Web Store review and the product promise, so they are
decisions rather than implementation details. Record the outcome in `docs/adr/`.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/), scoped by
extension:

```
feat(auto-refresh): add cadence picker
fix(auto-refresh): clear alarm when tab closes
docs: explain the alarms 30s floor
```

## License

By contributing you agree your contributions are licensed under the MIT License.
