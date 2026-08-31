# Changelog

## 1.0.0 — 2026-08-31

First public release.

- Per-tab auto refresh with a cadence from 30 seconds to 1 hour.
- Optional cache bypass.
- Toolbar badge showing whether the current tab is refreshing.
- A one-time notice that reloading discards anything typed into the page.
- Requests `alarms` and `storage` only, so it installs with no permission
  warnings. No host permissions, no content scripts, no network requests.
