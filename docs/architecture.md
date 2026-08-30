# Architecture

## Shape of an extension

Every extension in this repo is the same three pieces:

- **`src/background/` — the service worker.** Owns all scheduling and all
  persisted state. It is the only place that talks to `chrome.alarms` and the
  only place that decides when something happens.
- **`src/popup/` — the UI.** Reads state, sends intent, renders. It holds no
  authority: closing the popup must never change behavior.
- **`src/lib/` — pure logic.** No `chrome.*` calls. This is where the real
  decisions live, which is what makes them testable without a browser.

The split exists for one reason: MV3 service workers are killed and restarted
constantly, so anything stateful has to be reconstructible from storage, and
anything worth testing has to be callable without a browser.

## State

- `chrome.storage.session` — state tied to the current browser session, such as
  anything keyed by tab id. Tab ids do not survive a restart, so this state
  should not either.
- `chrome.storage.local` — user preferences that outlive a session.

Never cache either one in a module-level variable and assume it is still there.
The worker may have been terminated between two lines of user-visible behavior.

## Reconciliation

Alarms outlive the state that explains them. On `chrome.runtime.onStartup` and
`onInstalled`, every extension walks its alarms, drops the ones with no matching
state, and re-creates the ones whose state survived. Treat this as a normal path,
not an error path.

## Build

Each extension builds to its own `dist/`, which is what Chrome loads unpacked and
what gets zipped for the Web Store. Builds are readable — no obfuscation, no
aggressive minification, sourcemaps included — because reviewers and users read
what we publish.

## Why a monorepo

Shared conventions, one CI pipeline, one place to learn how things are done.
Shared _code_ is deliberately minimal: `packages/config` holds build
configuration, and nothing gets extracted into a shared package until a second
extension actually needs it. Speculative abstraction is the main way a repo like
this becomes hard to work in.
