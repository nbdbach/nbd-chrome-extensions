# AGENTS.md

The contract for anyone — human or agent — working in this repo. Read this
before changing anything. If something here is wrong, fix this file in the same
PR as the code.

## What this repo is

A monorepo of small, unintrusive, open-source Chrome extensions published under
the **NBD** publisher name on the Chrome Web Store.

The product promise is the same for every extension here, and it constrains the
code more than any style rule:

- **Minimum permissions.** Ideally zero permission warnings at install.
- **No network.** No analytics, no telemetry, no remote config, no external fonts.
- **Small.** If a bundle crosses ~50KB, something has gone wrong.
- **Readable when shipped.** Reviewers and users can read what we published.

## Commands

```bash
npm install          # once
npm run check        # typecheck + lint + test + build — the one command that matters
npm run typecheck
npm run lint
npm run format       # writes; lint only checks
npm run test
npm run build
npm run new          # scaffold a new extension
npm run package -- <name>   # build + zip for Web Store upload
```

`npm run check` is exactly what CI runs. If it passes locally it passes in CI.
Never add a CI step that has no local equivalent.

## Layout

```
extensions/<name>/     one extension, self-contained
  src/background/      service worker — owns all scheduling and state
  src/popup/           the entire UI
  src/lib/             pure logic, no chrome.* calls — this is what unit tests cover
  _locales/en/         all user-visible strings
  store/               listing copy, screenshot script, promo assets
  tests/
packages/config/       shared tsconfig; add here only when a 2nd extension needs it
scripts/               new-extension.ts, package.ts
docs/adr/              why decisions were made — read before re-litigating one
```

## Invariants

These are enforced by tests, not by review. If you think one should change, that
is an ADR, not a code edit.

1. **Manifest V3 only.**
2. **Permissions are allowlisted per extension** in its manifest test. Adding a
   permission means updating that test, which means justifying it in the PR.
3. **No host permissions, no `<all_urls>`, no content scripts** unless an ADR
   says otherwise. Broad host permissions are the single biggest cause of slow
   Web Store review, and they break the product promise above.
4. **No network requests at runtime.** No `fetch`, no remote scripts, no CDN
   fonts.
5. **Every user-visible string lives in `_locales`**, never inline in source.
6. **No new runtime dependency** without an ADR. Dev dependencies are fine.
7. **Shipped code is readable.** Do not enable aggressive minification or any
   obfuscation. Ship sourcemaps.

## MV3 rules that break code if ignored

- **The service worker is terminated aggressively.** Never keep state in a
  module-level variable and assume it survives. Read from `chrome.storage` on
  every wake. This is the most common MV3 bug by a wide margin.
- **`chrome.alarms` has a 30-second minimum period in production.** Unpacked dev
  builds have _no_ limit, so local testing will happily run a 5-second alarm
  that silently degrades once published. Never rely on sub-30s scheduling.
- **Tab ids do not survive a browser restart, but alarms do.** Reconcile on
  `chrome.runtime.onStartup` and drop orphaned alarms.
- **`chrome.tabs.reload(tabId)` needs no permission.** `chrome.tabs.query()`
  returns tab ids without the `tabs` permission — it only needs `tabs` for
  `url`, `title`, `pendingUrl`, and `favIconUrl`. Requesting `tabs` shows the
  user "Read your browsing history", so we do not.

## Vocabulary

Use these words in code, docs, UI, and store copy. Consistency matters more than
which word was chosen.

| Term      | Means                                    |
| --------- | ---------------------------------------- |
| extension | one publishable unit under `extensions/` |
| target    | the tab an extension is acting on        |
| cadence   | the interval between repeated actions    |
| enabled   | user-facing on/off state for a target    |

## Testing

- **Coverage must stay at or above 80%** for lines, statements, branches and
  functions. `npm run check` enforces it, so a drop fails the build rather than
  being noticed later.
- `src/lib/` is pure and gets real unit tests. Push logic there so it can be
  tested without a browser.
- Each extension has a manifest test asserting the invariants above.
- The service worker and popup are tested together against
  `tests/fake-chrome.ts`, an in-memory stand-in for the chrome API. Testing them
  as a pair is deliberate: the seam between them is what breaks, and a mock on
  either side would hide exactly that.
- Each extension gets one Playwright smoke test: load unpacked, drive the popup,
  assert the observable behavior. _(Not yet written — see the repo TODO.)_

Do not mock your way to a green build. If a test needs the `chrome` API, use the
fake; if it needs real service-worker termination or real alarm timing, that
belongs in the smoke test, not in a unit test that pretends.

## Definition of done

- `npm run check` passes.
- New behavior has a test that fails without the change.
- User-visible strings are in `_locales`.
- The PR says how it was verified.
- Anything surprising is written down in `docs/adr/`.
