# NBD Auto Refresh

Automatically reload the current tab on a schedule you choose.

## Why it is different

- **No permission warnings at install.** It asks for `alarms` and `storage`, and
  neither shows a warning. It never requests `tabs`, host permissions, or
  `<all_urls>`.
- **No network requests.** No analytics, no remote config, no external fonts.
- **Per tab, not global.** Turning it on for one tab does not touch any other.

`chrome.tabs.reload(tabId)` needs no permission, and tab ids come back from
`chrome.tabs.query()` without the `tabs` permission — that is only needed for a
tab's URL, title, and favicon, which this extension never reads. The trade is
that the popup says "this tab" rather than naming the page. Worth it.

## Cadence

Chrome enforces a 30 second minimum on alarm periods in published extensions.
Unpacked development builds have no such limit, so anything faster works locally
and silently degrades once installed from the store. 30 seconds is the floor
here, deliberately.

## Development

From the repo root:

```bash
npm run check                      # typecheck, lint, tests + coverage, build
npm run build --workspace extensions/auto-refresh
```

Coverage report lands in `coverage/`. The threshold is 80% and is enforced by
`npm run check`.

Then load `extensions/auto-refresh/dist` via `chrome://extensions` →
Developer mode → Load unpacked.

Icons are generated, not hand-drawn: `python3 store/make-icons.py` (stdlib only).

## License

MIT.
