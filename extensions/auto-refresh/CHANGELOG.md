# Changelog

## Unreleased

- The cadence is now entered as an interval and a unit ("10 minutes") instead of
  picked from a fixed list, so any whole interval from 30 seconds to 24 hours is
  available.
- An interval Chrome would not honour is refused with an explanation rather than
  silently clamped, and the toggle stays disabled until it is usable.

## 1.0.0 — 2026-08-31

First public release.

- Per-tab auto refresh with a cadence from 30 seconds to 1 hour.
- Optional cache bypass.
- Toolbar badge showing whether the current tab is refreshing.
- A one-time notice that reloading discards anything typed into the page.
- Requests `alarms` and `storage` only, so it installs with no permission
  warnings. No host permissions, no content scripts, no network requests.
