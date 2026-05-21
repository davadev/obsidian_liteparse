# Changelog

All notable changes to this plugin are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.2] - 2026-05-21

### Fixed

- Parsing now spawns the LiteParse CLI (`node …/dist/src/index.js parse
  <pdf> --format json`) as a subprocess and reads JSON from stdout. The
  previous approach (dynamic `import(fileURL)` from inside Obsidian's
  renderer process) failed with "Failed to fetch dynamically imported
  module" because Electron's renderer treats `import()` as a web fetch
  and refuses `file://` URLs. The subprocess approach sidesteps the
  renderer ESM trap completely and keeps LiteParse crashes out of the
  Obsidian process.

## [0.1.1] - 2026-05-21

### Added

- Auto-install of `@llamaindex/liteparse` into the plugin folder on first
  use. No more manual `npm install` step for users with Node on PATH.

### Fixed

- ESM import path for LiteParse. The 0.1.0 build emitted a `require()`
  for `@llamaindex/liteparse`, which fails because LiteParse is ESM with
  top-level await. The plugin now loads it via a real `import(fileURL)`
  through Node's native ESM loader.
- Release workflow is now idempotent — re-running for an existing tag
  uploads/clobbers artifacts instead of failing.

## [0.1.0] - 2026-05-21

### Added

- Initial release.
- File-explorer right-click action: **Parse PDF with LiteParse**.
- Editor-menu action: **Parse linked PDF with LiteParse**.
- Command palette commands:
  - Parse PDF linked in current note with LiteParse.
  - Parse selected/current PDF with LiteParse.
- PDF link detection for `![[file.pdf]]`, `[[file.pdf]]`,
  `[label](file.pdf)`, URL-encoded paths, and aliased wikilinks.
- Parsed block insertion below the matching PDF link with HTML
  comment markers (`<!-- liteparse:start … -->` / `… liteparse:end …`).
- Replace existing parsed blocks by default.
- Fallback parsed-note creation when no linking note is found.
- Settings tab covering output, fallback, attribution, OCR, page range,
  max pages, parse timeout, JSON inclusion, debug logging.
- LiteParse attribution and Apache-2.0 license.
