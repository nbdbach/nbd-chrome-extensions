# Store assets

Everything for the Chrome Web Store listing lives here. Assets are **generated**,
not hand-edited, so they can be regenerated the moment the popup changes — which
is the only way listing images stay honest.

```bash
npm run store:assets    # screenshots + promo tile, from the real extension
python3 store/make-icons.py   # the extension icons (stdlib only)
```

`store:assets` needs a Playwright browser: `npx playwright install chromium`.
Set `CHROMIUM_PATH` to reuse an existing Chromium instead.

## Generated

| File                                   | Size     | Store slot       |
| -------------------------------------- | -------- | ---------------- |
| `assets/screenshot-1-per-tab.png`      | 1280x800 | screenshot       |
| `assets/screenshot-2-cadence.png`      | 1280x800 | screenshot       |
| `assets/screenshot-3-no-surprises.png` | 1280x800 | screenshot       |
| `assets/screenshot-4-permissions.png`  | 1280x800 | screenshot       |
| `assets/promo-tile-440x280.png`        | 440x280  | small promo tile |
| `../public/icons/icon-128.png`         | 128x128  | store icon       |

The screenshots are composed: the popup is captured at 2x from a real Chrome
with the extension loaded, then placed on a frame rendered at exactly the size
the store requires. Nothing in them is mocked up.

Fonts come from the machine that runs the script, so regenerate on macOS if you
want macOS type rendering.

## Still to write

- [ ] Item summary, 132 characters or fewer
- [ ] Detailed description, opening with the single-purpose sentence
- [ ] Privacy policy URL (this extension collects nothing — say exactly that)
- [ ] Optional: 1400x560 marquee tile, YouTube link

## Single purpose

The store's single-purpose field, the manifest description, and the first line
of the store description must match word for word:

> Automatically reload the current tab on a schedule you choose.

`tests/manifest.spec.ts` enforces the manifest half of that.
