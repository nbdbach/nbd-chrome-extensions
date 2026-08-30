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

---

# First publish: the manual steps

Everything below needs a human. The code and the listing assets are done.

## Step 1 — Create the developer account

1. Create a **new Google account** used only for publishing. The developer
   account's email **can never be changed**, and every policy notice goes there.
2. Go to the Chrome Web Store developer dashboard and sign in with it.
3. Accept the developer agreement and pay the **one-time $5 USD** fee.
4. In account settings, set the publisher display name to **NBD** and verify the
   contact email. Verify a domain too if you have one — it strengthens the
   listing's trust signals.

Note the cap while planning: new publishers start limited to **two published
extensions**, raised later based on account tenure and engagement.

## Step 2 — Publish the privacy policy

The store requires a URL even when nothing is collected. GitHub Pages is fine —
the repo is org-owned, so there is no future account transfer that would break
the link.

1. In the repo, enable GitHub Pages (Settings -> Pages) or create a `gh-pages`
   branch with a single `privacy.html`.
2. Publish text to this effect, and nothing weaker:

   > NBD Auto Refresh collects nothing. No personal information, no browsing
   > history, no page content or URLs, no analytics, no telemetry, and no
   > network requests of any kind.
   >
   > The extension stores two things in your browser using Chrome's storage
   > API: the refresh interval you last chose, and which tabs are currently
   > refreshing. Both stay on your device, are never transmitted, and are
   > removed when you uninstall.
   >
   > It requests two permissions: `alarms` to schedule reloads, and `storage`
   > to remember the settings above. It requests no host permissions and
   > injects no code into pages.
   >
   > Source: https://github.com/nbdbach/nbd-chrome-extensions

3. Confirm the URL loads in a private window before using it.

## Step 3 — Regenerate the assets on macOS

The committed screenshots were generated on Linux, so the type is rendered with
Linux fonts. Regenerate for macOS type:

```bash
npx playwright install chromium
npm run store:assets
```

Check the five files in `extensions/auto-refresh/store/assets/` and commit them
if they changed.

## Step 4 — Cut version 1.0.0

`0.1.0` reads as a pre-release. Bump both files — the manifest test asserts they
match — then tag:

```bash
# edit "version" in extensions/auto-refresh/manifest.json and package.json
npm run check
git commit -am "chore(auto-refresh): release 1.0.0"
git tag auto-refresh@1.0.0
git push && git push --tags
```

The tag triggers `release.yml`, which builds, packages, and attaches the zip to
a GitHub Release. **Upload that exact zip to the store** — that is what makes
the published build reproducible from source, which is the whole pitch.

## Step 5 — Create the listing

On the dashboard, add a new item and upload the zip from the Release.

**Store listing tab**

- Summary (132 char limit):
  > Automatically reload the current tab on a schedule you choose. No permission
  > warnings, no network requests, no tracking.
- Description: open with the single-purpose sentence **verbatim**, then the
  differentiators — no permission warnings, no network, per tab not global,
  under 20KB, MIT with reproducible builds. Link the repo.
- Category: Workflow & Planning (or Developer Tools).
- Upload the four screenshots and the promo tile from `store/assets/`.

**Privacy tab**

- Single purpose — paste exactly, no rewording:
  > Automatically reload the current tab on a schedule you choose.
- Permission justifications, one sentence each:
  - `alarms` — "Schedules the periodic reload the user configures; without it
    the extension cannot refresh on an interval."
  - `storage` — "Remembers the user's chosen interval and which tabs are
    active; all of it stays on the device."
- Data usage: tick nothing, and certify that no user data is collected.
- Paste the privacy policy URL from Step 2.

**Distribution tab**

- Visibility: **Unlisted** for the first release.
- Choose the countries to distribute to.

Then submit for review.

## Step 6 — Review, then go public

Review usually takes a few days and can stretch to weeks; contact developer
support past three weeks. When it clears:

1. Install from the unlisted link **in a clean Chrome profile**.
2. **Uninstall the unpacked copy first** if you have it loaded — two copies both
   refresh the same tab, which looks like a bug.
3. Use it for about a week. Settings will not carry over from the unpacked
   copy: the store build gets a different extension ID and `chrome.storage` is
   scoped per ID.
4. Flip visibility to **Public** on the Distribution tab. That is a listing
   change, so it goes through review again.
