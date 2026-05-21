# Changelog

All notable changes to this plugin are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
