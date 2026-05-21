# Changelog

All notable changes to this plugin are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.1] - 2026-05-21

### Added

- **Explicit template picker.** New file-menu item
  "Parse PDF with LiteParse (choose template)…" (shown when at least
  one template is defined) and new command palette entry of the same
  name. Both open a fuzzy-suggest modal listing all defined templates
  plus two sentinels — *Auto — match by regex* (default behavior) and
  *None — no template* (skip region filtering for this parse).
- `parsePdf` accepts an optional `templateOverride` argument:
  - `undefined` (default) → auto-match templates via `match` regex.
  - `null` → force no template.
  - a `ParsingTemplate` → use this template, bypassing regex match.

## [0.2.0] - 2026-05-21

### Added

- **Reflow extraction mode (new default).** Reconstructs clean reading
  flow from LiteParse's positioned `textItems` instead of using the raw
  `page.text` field, which preserved every PDF whitespace artifact. The
  old behavior is still available as the **Raw** mode in settings.
- **Page divider** setting. Inserts a configurable separator (default
  `---`) between pages. Set to empty for no divider.
- **Include page headings** toggle. `### Page N` can be turned off.
- **Collapse blank lines** toggle. Collapses runs of 3+ blank lines to
  one and trims trailing whitespace.
- **Parsing templates.** User-defined per-PDF region templates with
  percent-based, top-left-origin coordinates. Each template has a
  `match` regex (against the vault-relative PDF path), an optional page
  range, and `include`/`exclude` regions. Excludes filter textItems
  (headers/footers); includes define column or section bounds with
  optional Markdown heading per region. Templates are edited as JSON in
  the settings tab with validation.

### Changed

- `parsePdf` now takes the vault-relative PDF path so it can match
  templates.

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
