# Publishing runbook

Facts here were verified against Chrome's developer documentation. Re-check
anything policy-related before a submission — it moves.

## One-time account setup

1. Register at the Chrome Web Store developer dashboard using a **dedicated
   Google account**. One-time **$5 USD** fee, covers every future extension.
2. **The developer account email can never be changed after creation.** Moving an
   item to a different account requires a support request. Get this right once.
3. Publisher display name: **NBD**, matching the GitHub repo and extension names.
4. Verify the contact email; verify a domain if there is one.

## Limits worth knowing before planning a portfolio

- An account supports up to 20 published items.
- **New publishers start limited to two published extensions**, with increases
  based on account tenure and engagement. Confirm the current cap on the
  dashboard before building a third thing.

## Per-extension checklist

### Before submitting

- [ ] `npm run check` green
- [ ] Version bumped in the manifest, `CHANGELOG.md` updated
- [ ] Single-purpose sentence is **identical** in the manifest description, the
      store description's first line, and the Privacy tab's single-purpose field.
      Mismatch here is a common and entirely avoidable rejection.
- [ ] Permission justifications written — one sentence each
- [ ] Privacy policy URL live
- [ ] Screenshots regenerated from the current UI

### Listing assets

| Asset              | Spec                  | Required          |
| ------------------ | --------------------- | ----------------- |
| Store icon         | 128x128               | yes               |
| Screenshots        | 1280x800, 1-5 of them | yes, at least one |
| Small promo tile   | 440x280               | yes               |
| Marquee promo tile | 1400x560              | optional          |
| YouTube video      | link field            | optional          |

Name field: max 75 characters. Item summary: max 132 characters. Keyword-stuffed
names violate policy — keep titles clear and descriptive.

### Packaging

```bash
npm run package -- <extension-name>
```

Zips the **contents** of `dist/`, not the folder itself. Chrome rejects the
wrong shape.

### Submitting

1. Upload the zip on the dashboard, complete the Store Listing, Privacy, and
   Distribution tabs.
2. Publish **Unlisted** first. Install from a clean Chrome profile and use it for
   a week before going Public. This costs nothing and catches packaging mistakes
   before they reach public reviews.
3. Submit for review.

### Review expectations

Usually a few days; occasionally several weeks. Contact developer support past
three weeks.

What slows review, per Google's own documentation:

- broad host permissions (`<all_urls>`, `*://*/*`) — the biggest single factor
- obfuscated or heavily minified code
- new developer accounts and new extensions
- prior rejections on the account

Our invariants exist partly to keep us off all of these.

### After publishing

- [ ] Tag the release: `<extension>@<version>`
- [ ] Attach the exact submitted zip to the GitHub Release, so anyone can rebuild
      from the tag and compare against what the store serves. For a utility whose
      whole pitch is trust, this is the point.
