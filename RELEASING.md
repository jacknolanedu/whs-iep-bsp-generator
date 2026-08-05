# Releasing Generate4U

How a new version reaches teachers. The robots build; a human publishes.

## Normal release, step by step

1. **Bump the version** on a branch cut from `main`:
   - `package.json` → `"version": "1.2.0"` (new number; keep to X.Y.Z)
   - `npm install --package-lock-only` (syncs the lockfile's version)
   - Add a `## Changes by mrdavearms` entry to `README.md` if the release
     contains work that doesn't have one yet.
   - PR it, get it merged.
2. **Tag the merge commit** (this is the trigger — pushing a tag does not
   modify the `main` branch):
   ```bash
   git fetch origin && git checkout main && git pull
   git tag v1.2.0
   git push origin v1.2.0
   ```
3. **Watch the build**: GitHub → Actions → "Release". Two jobs run in
   sequence (Mac, then Windows), about 10–15 minutes total. They attach to
   one **draft** release: a `.dmg` and `.zip` (Mac), and
   `Generate4U-Setup.exe` + a `.nupkg` + a `RELEASES` file (Windows —
   all three are required; the last two are what auto-update reads).
4. **Publish the draft**: Releases page → the draft → add plain-English
   release notes teachers can read → **Publish release**. This is the
   go-live moment: installed apps see the new version at their next check
   (on launch and every 4 hours).
5. **Spot-check**: download the DMG and the Setup exe from the published
   release and open each once if you can.

## Before the very first release from this pipeline

Do these once, in this order. They cannot be undone later.

1. **Delete the two stale drafts.** They were built by hand before this
   pipeline existed and their files use the old installer naming. Drafts are
   invisible to users and to auto-update, so deleting them costs nothing:
   ```bash
   gh release delete v1.1.7 --repo jacknolanedu/whs-iep-bsp-generator --yes
   gh release delete v1.0.1 --repo jacknolanedu/whs-iep-bsp-generator --yes
   ```
   If a draft tagged `v1.1.7` is left in place and someone tags `v1.1.7`, the
   build reuses that draft and keeps its old files — the publisher never
   overwrites an existing asset — and Windows updates would then read a stale
   package. Publishing that is not reversible.
2. **The first tag must be higher than `v1.1.7`.** Use `v1.2.0`. Bump
   `package.json` to match (`npm pkg set version=1.2.0` then
   `npm install --package-lock-only`) — the workflow refuses to build if the
   tag and `package.json` disagree.
3. **Check the repo's Actions settings**: Actions must be enabled, and
   workflow permissions must allow writing (Settings → Actions → General →
   Workflow permissions → "Read and write"). Otherwise the build runs for
   ~15 minutes and then fails at the upload step with a 403.

## Rules

- The tag must exactly match `package.json`'s version (`v1.2.0` ↔ `1.2.0`);
  the workflow refuses to build otherwise.
- Never re-use a version number teachers may already have.
- Never delete a published release that auto-update has served — Windows
  updates read the `RELEASES` chain.
- Publishing the draft is the release decision. Per the repo's working
  agreement, that's Jack's call unless he's delegated it.

## If the build fails

**Delete the draft release first — this is mandatory, not tidying.** The
publisher never overwrites an asset that already exists under the same name,
so re-running a build over a half-filled draft silently keeps the *broken*
files and uploads only what's missing. Drafts are invisible to users and to
auto-update, so deleting one costs nothing.

1. Fix the problem on a branch → PR → merge.
2. Delete the draft:
   ```bash
   gh release delete v1.2.0 --repo jacknolanedu/whs-iep-bsp-generator --yes
   ```
3. Move the tag and push again:
   ```bash
   git tag -d v1.2.0
   git push origin :refs/tags/v1.2.0   # deleting a TAG, never a branch
   git fetch origin && git checkout main && git pull
   git tag v1.2.0 && git push origin v1.2.0
   ```

**Known flake:** the Mac job occasionally fails with `hdiutil: Resource busy`
while building the DMG. That's a GitHub runner quirk, not a code problem —
delete the draft and re-run the job.

## How updates reach teachers

- **Windows**: the app polls `update.electronjs.org` (a free Electron-project
  service that proxies this repo's latest *published* release). New versions
  download silently and install on the next app launch; teachers are offered
  an immediate restart.
- **Mac**: unsigned apps can't self-update (Apple restriction), so the app
  polls the GitHub Releases API and shows a download dialog for the new DMG.
- Old builds (v1.1.7 and earlier) predate the updater: those users must
  manually download once; everything from the first auto-update release
  onwards updates itself.

## Signed macOS updates (when a certificate exists)

Requires an Apple Developer Program membership (~US$99/yr). Then:
1. Add to `packagerConfig` in `forge.config.js` (env-guarded so unsigned
   local builds keep working):
   ```js
   ...(process.env.APPLE_ID ? {
     osxSign: {},
     osxNotarize: {
       appleId: process.env.APPLE_ID,
       appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
       teamId: process.env.APPLE_TEAM_ID
     }
   } : {})
   ```
2. Add repo secrets `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`,
   `APPLE_TEAM_ID`, plus the signing certificate (import via
   `apple-actions/import-codesign-certs`), and pass them to the macOS job in
   `release.yml`.
3. In `src/update-manager.js`, replace the darwin branch of
   `initUpdateManager` with the built-in updater:
   ```js
   // 'darwin-x64' / 'darwin-arm64' — in a universal binary process.arch
   // reports the arch actually running. Do NOT use 'darwin-universal';
   // that is not a platform segment the service routes.
   autoUpdater.setFeedURL({
     url: 'https://update.electronjs.org/jacknolanedu/whs-iep-bsp-generator/darwin-' +
       process.arch + '/' + app.getVersion(),
     serverType: 'json'
   });
   autoUpdater.on('update-downloaded', () => promptWindowsRestart()); // same dialog
   autoUpdater.checkForUpdates();
   setInterval(() => autoUpdater.checkForUpdates(), CHECK_INTERVAL_MS);
   ```
   (Squirrel.Mac consumes the zip the release workflow already uploads.)
   Re-check the current platform-segment format against update.electronjs.org's
   README when activating this — it's the one detail here nobody has run live.
4. Bonus: signing also removes the "Apple could not verify…" warning in the
   README's Mac install steps — simplify them when this lands.
