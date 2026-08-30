# Store assets

Everything needed for the Chrome Web Store listing lives here.

- `make-icons.py` — generates `public/icons/*.png` from stdlib Python. No image
  library, nothing to audit. Re-run after changing the mark.

## Still to produce before submission

- [ ] Screenshots, 1280x800, 1-5 of them (generate with Playwright so they
      regenerate when the popup changes)
- [ ] Small promo tile, 440x280
- [ ] Marquee promo tile, 1400x560 (optional)
- [ ] Listing copy: summary under 132 characters, detailed description
- [ ] Privacy policy URL

## Single purpose

The store's single-purpose field, the manifest description, and the first line
of the store description must match word for word:

> Automatically reload the current tab on a schedule you choose.

`tests/manifest.spec.ts` enforces the manifest half of that.
