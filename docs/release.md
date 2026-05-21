# Release workflow

This document describes how a new version of LiteParse PDF Parser is cut, tagged, built, and published. The flow is designed to be idempotent and BRAT-compatible.

## Versioning

- The project follows [Semantic Versioning](https://semver.org/): `MAJOR.MINOR.PATCH`.
- Tags use the bare version (no `v` prefix), e.g. `0.5.1`. This is required by Obsidian's plugin release conventions and by the `Release` workflow trigger pattern `[0-9]+.[0-9]+.[0-9]+`.
- Three files must agree on the version:
  - `package.json` → `version`
  - `manifest.json` → `version`
  - `versions.json` → key for the new version mapped to its `minAppVersion`
- `version-bump.mjs` updates `manifest.json` and `versions.json` from `process.env.npm_package_version`, so running `npm version <new>` keeps all three in sync.

## Files involved

| File | Purpose |
|------|---------|
| `package.json` | Source of truth for the npm version. |
| `manifest.json` | Plugin metadata loaded by Obsidian; `id`, `name`, `version`, `minAppVersion`, `isDesktopOnly`. |
| `versions.json` | Map of every released plugin version → required Obsidian `minAppVersion`. BRAT reads this. |
| `version-bump.mjs` | Run by `npm version`; mirrors the new version into `manifest.json` and adds it to `versions.json`. |
| `CHANGELOG.md` | Human-readable history; new entry per release using Keep a Changelog format. |
| `.github/workflows/ci.yml` | Typecheck + build + artifact sanity check on every push/PR to `main`. |
| `.github/workflows/release.yml` | Tag-triggered; builds and publishes the GitHub release with `main.js`, `manifest.json`, `styles.css`. |

## End-to-end release flow

The full path from "code is ready on `main`" to "BRAT users can update" is:

1. **Make sure `main` is green.** The CI workflow runs on every push/PR to `main`. Do not release from a red commit.
2. **Update `CHANGELOG.md`.** Move `Unreleased` notes under a new `## [X.Y.Z] - YYYY-MM-DD` heading. Keep the empty `## [Unreleased]` heading on top so future PRs have a landing spot.
3. **Bump the version.** From the project root:
   ```bash
   npm version <new-version> --no-git-tag-version
   ```
   - `--no-git-tag-version` keeps `npm` from creating its own tag — the GitHub tag is created manually in step 6 so it stays in sync with the commit that holds the changelog entry.
   - `version-bump.mjs` runs as the `version` script and writes the new version into `manifest.json` and adds it to `versions.json` with the current `minAppVersion`.
4. **Build locally and verify.**
   ```bash
   npm run build
   ```
   This runs `tsc --noEmit` then `esbuild` in production mode. Confirm `main.js`, `manifest.json`, and `styles.css` are present at the repo root — these are the three files Obsidian and BRAT expect.
5. **Commit the version bump and changelog.**
   ```bash
   git add package.json manifest.json versions.json CHANGELOG.md
   git commit -m "Release X.Y.Z"
   git push origin main
   ```
   Wait for CI to go green on that commit.
6. **Tag and push the tag.**
   ```bash
   git tag X.Y.Z
   git push origin X.Y.Z
   ```
   No `v` prefix. The tag must exactly match the version in `manifest.json`.
7. **Release workflow takes over.** The push of a tag matching `[0-9]+.[0-9]+.[0-9]+` triggers `.github/workflows/release.yml`, which:
   - checks out the tagged commit
   - installs dependencies (`npm ci` with `npm install` fallback)
   - runs `npm run build`
   - creates the GitHub release named `X.Y.Z` and uploads `main.js`, `manifest.json`, `styles.css`
   - **is idempotent**: if a release for the tag already exists (e.g. you created one manually), it uploads the artifacts with `--clobber` instead of failing.

## What BRAT sees

[BRAT](https://github.com/TfTHacker/obsidian42-brat) checks the repo's GitHub releases and downloads `main.js`, `manifest.json`, and `styles.css` from the latest release whose tag matches the plugin's manifest version. Because `release.yml` always attaches those three artifacts to the tag, BRAT installs and updates work without any manual asset upload.

`versions.json` is what BRAT (and the official Obsidian plugin registry) use to decide whether a user's Obsidian version is new enough. Every release must add a row.

## Idempotency and recovery

- **Re-running the workflow on an existing tag** uploads new artifacts to the existing release (`gh release upload --clobber`). Safe to use after a hot-fix rebuild as long as the tag's commit is still the right one.
- **Forgetting to push the tag** is the most common miss. CI green on `main` is not enough — the Release workflow only fires on tag push.
- **Wrong version in `manifest.json`** is caught by BRAT, not by the workflow. Always run `npm version` rather than hand-editing.
- **Yanking a bad release**: delete both the GitHub release and the tag, then ship the fix as a new patch version. Avoid re-using a version number — BRAT caches by tag.

## Manual fallback

If the Release workflow is unavailable, the same artifacts can be published manually:

```bash
npm run build
gh release create X.Y.Z \
  --title "X.Y.Z" \
  --notes "See CHANGELOG.md for details." \
  main.js manifest.json styles.css
```

This produces the same artifact layout BRAT expects.

## Pre-release checklist

- [ ] CI green on `main`
- [ ] `CHANGELOG.md` updated with `## [X.Y.Z] - YYYY-MM-DD`
- [ ] `npm version X.Y.Z --no-git-tag-version` run (bumps `package.json`, `manifest.json`, `versions.json`)
- [ ] `npm run build` succeeds locally; `main.js`, `manifest.json`, `styles.css` present
- [ ] Release commit pushed to `main`
- [ ] Tag `X.Y.Z` created and pushed
- [ ] GitHub release exists and lists the three artifacts
- [ ] BRAT can pull the new version in a test vault
