# Changelog

All notable changes to this plugin are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.6.5] - 2026-05-21

### Fixed

- **Probes now run for explicit template selections too.** Previously
  the parser only ran probes when `templateOverride === undefined`
  (auto-match path). Picking a template via the
  "Parse PDF with LiteParse (choose template)…" command — or the
  "Auto" sentinel that resolves to the matched template — passed the
  template as an override, which silently bypassed the probe pipeline
  entirely. The probe might match in the visual editor preview but
  never fire during the actual parse. Probes now run whenever there is
  an effective template, regardless of how it was chosen.
- **Diagnostics Notice always shows.** No longer gated on the
  auto-match path. After every parse you see which template was used
  and how many pages probes skipped / switched, even when you picked
  the template explicitly. The console always logs the diagnostics
  object too (not gated on Debug logging).

## [0.6.4] - 2026-05-21

### Fixed

- **Visual editor changes now auto-save.** The "Save regions" button
  was a footgun: a user could edit a probe pattern in the visual
  editor, see the live ✓ matches indicator validate against the draft,
  and then close (or just parse) without clicking Save. The settings
  still held the original (often broken) pattern, so parsing used the
  old value while the editor preview reported "matches". Now every
  mutation in the visual editor — drawing a rect, renaming, changing
  coords/role/action/target, editing pattern/flags, deleting — commits
  immediately through `onChange`. The bottom "Save regions" / "Cancel"
  pair is replaced by a single "Done" button (plus an inline hint
  `Changes save automatically.`); closing the modal additionally fires
  an `onClose` callback that refreshes the settings card UI and shows
  the saved-N notice.
- `VisualRegionEditorModal` constructor signature changed: takes a
  `VisualEditorCallbacks` object (`onChange` + optional `onClose`)
  instead of a single `onSave`. Settings tab updated accordingly.

## [0.6.3] - 2026-05-21

### Added

- **Post-parse diagnostics Notice.** Every parse (with auto-template
  match) now shows a short Notice naming the template that was
  selected, the number of pages probes skipped (with page numbers), and
  the number of pages probes switched. If you see "template: (none —
  using defaults)" the auto-match regex didn't match the PDF path; if
  the skipped count is 0 the probe didn't fire (either text didn't
  match, regex was invalid, or you're on the wrong template).
- **Per-probe-per-page debug log.** With Debug logging on, the console
  now shows for every probe evaluation: the extracted text (first 80
  chars), the pattern, and MATCH/no match. This is the cheapest way to
  understand why a probe isn't firing — turn on Debug logging in
  settings, open the developer console, re-parse.

## [0.6.2] - 2026-05-21

### Added

- **Live regex feedback in probe editors.** Pattern inputs now validate
  their regex on every keystroke. Invalid patterns (e.g. `*Viktoria*` —
  bare `*` is not a regex quantifier you can put at the start) get a red
  border and a hover tooltip with the underlying error. Previously such
  patterns were silently skipped during parsing, leaving users to wonder
  why their probe never fired.
- **Live match indicator in the visual editor's probe preview.** Each
  probe row now shows ✓ matches / ✗ no match / ✗ invalid regex / (no
  pattern) next to its extracted-text line. Edit the regex or the
  rectangle and the indicator updates immediately, so you can iterate
  the pattern against the real PDF text without re-running a parse.
- **Notice during parse when a probe has invalid regex.** Surfaces up to
  three of the offending `template/probe` names so users notice the
  silent skip and fix the pattern.

### Fixed

- **Visual editor probe table overflow.** The probes table wrapped in
  its own `overflow-x: auto` scroller, matching the settings card fix
  from 0.6.1. The visual editor modal no longer scrolls horizontally
  when a long probe row pushes the table beyond the modal width.

## [0.6.1] - 2026-05-21

### Fixed

- **Template card overflow.** The new probes table pushed the whole
  settings dialog wider than its container, producing a horizontal
  scrollbar across the entire modal. Both the regions table and the
  probes table now live inside per-card `overflow-x: auto` scrollers, so
  long rows scroll inside the card without breaking the modal layout.
  Probe input widths trimmed (Name 6rem, coords 3.2rem, Pattern 8rem,
  Flags 2.5rem) for better single-row fit.

### Added

- **Probe text preview in the visual editor.** When a page is loaded in
  the visual editor, LiteParse is asked for that page's text items in
  the background. Each probe row in the editor now shows a `text: …`
  line underneath it with the actual extracted text that falls inside
  the probe rectangle. Updates live as the probe x/y/w/h change. Use
  this to shape your regex against the real PDF text instead of
  guessing.
- **"Draw probes visually…" button** next to "+ Probe" on each template
  card, opening the visual editor pre-switched to probe-drawing mode.
- The main visual-editor button is now labelled **"Edit visually
  (regions + probes)…"** so users see that both are editable there.
- `liteparseParsePage` helper in `installer.ts` — single-page parse via
  the LiteParse CLI returning `width`, `height`, and `textItems`. Used
  by the visual editor's probe preview; no impact on the main parse
  pipeline.

## [0.6.0] - 2026-05-21

### Added

- **Probes — pre-classification layer for templates.** A template can now
  define probes that run before include/exclude regions. Each probe is a
  small rectangle on the page plus a regex tested against the text inside
  it. When the regex matches, the probe's action fires: `skip` (drop the
  page from output entirely), `use-current` (keep parsing with the current
  template — same as no match), or `switch` to a named sibling template
  (cycle-guarded chain). Probes are evaluated in order; first match wins.
  Editable in each template card's "Probes (optional pre-classification)"
  subsection, and in the visual editor via the new **Draw: Regions / Probes**
  mode toggle. Probes render with a dotted magenta outline so they don't
  visually conflict with regions. Existing templates without `probes` work
  unchanged — the field is optional.
- **Auto-detect two-column layouts.** When a page (or single body include
  region wider than 60% of the page) clearly contains two text columns
  separated by a vertical gutter, the parser now emits them in reading
  order: full-width lines (titles) first, then the left column in full,
  then the right column in full. Conservative gates (≥6 items, ≥4 distinct
  y-bands, a ≥5%-wide gutter no item crosses, ≥50% vertical overlap on
  both sides) make the detector silently bow out on single-column pages.
  New toggle in Readability: **Auto-detect two-column layouts** (default
  on). Manual two-include-region templates always override.
- **Release workflow documentation.** New `docs/release.md` covering the
  end-to-end release process: versioning rules, file roles
  (`package.json` / `manifest.json` / `versions.json` / `version-bump.mjs`),
  the tag-triggered idempotent Release workflow, BRAT integration, recovery
  / yank guidance, manual `gh release create` fallback, and a pre-release
  checklist. Linked from `README.md` and `docs/development.md`.
- **CLAUDE.md** for AI assistants working in this repo — commands, the
  esbuild + LiteParse-must-stay-external bundle invariant, the
  Electron-renderer subprocess trap, template coordinate system pitfall,
  and the readability shaping pipeline order.

## [0.5.1] - 2026-05-21

### Fixed

- **Empty bullet lines are dropped.** When a PDF had a stray bullet
  glyph with no text after it (e.g. a banner-area decorative glyph
  that the bullet regex caught), 0.5.0 emitted a `- ` line by itself.
  `applyBulletReplacement` now returns `null` for empty-after-glyph
  lines and `emitLines` skips them.
- **Heading merge now spans multi-line blank gaps.** In single-content
  mode, the inter-block joiner produced 3+ consecutive blank lines
  before `collapseBlankLines` ran, and the merge function only
  tolerated one blank between same-level headings — so duplicated
  title-only / body slide pairs like Page 16 + Page 17
  (`#### What kinds of tasks can an intelligent system perform?`)
  stayed as two separate headings instead of one merged heading.
  Merge now skips any number of consecutive blank lines.

## [0.5.0] - 2026-05-21

### Added

- **Single-content mode.** New top-level toggle in Readability. When
  on, the parsed output is one flowing document — no `### Page N`
  headings, no `---` page dividers, no title-slide promotion. Useful
  for articles, books, or any PDF where page boundaries are
  meaningless in the output.
- **Merge consecutive same-level headings.** Slide titles wrapped
  across two lines (e.g. `#### Key theme 3: Socio-technical embedding
  of` + `#### technology`) are now joined into one heading
  (`#### Key theme 3: Socio-technical embedding of technology`).
  Toggleable (default on). Same-level only — `### Foo` + `#### Bar`
  stays as two headings.

### Changed

- Settings affected by Single-content mode (Include page headings,
  Page divider, Promote title-only slides) are visually grayed out
  and disabled while the mode is on, so it's clear they have no
  effect.

## [0.4.1] - 2026-05-21

### Changed

- **Visual editor: overlapping regions are now distinguishable.** Each
  region gets a unique color from a 12-entry palette (instead of just
  red=exclude / blue=include). Default render is borders-only (solid
  for excludes, dashed for includes) with no fill, so stacked regions
  don't visually merge into a single blob. Hovering a region — either
  on the page or its row in the table — fills it with a translucent
  tint, lifts it above its neighbors via `z-index`, and highlights the
  matching row. A color swatch column was added to the regions table
  to mirror the on-page color.
- Mousedown that originates on an existing region rectangle no longer
  starts drawing a new region (fixes accidental new-rect creation when
  the user just wanted to inspect an overlap).

### Notes

- Confirmed: exclude regions defined inside an include region work
  as expected. `applyTemplateToPage` filters all items through every
  exclude rectangle first, then bins the survivors into the include
  rectangles — so a "numbers" exclude nested inside "body" include
  drops those items from the body's text. This was already the
  behavior in 0.2.0+.

## [0.4.0] - 2026-05-21

### Added

- **Visual region editor.** A modal renders any PDF page via
  LiteParse's screenshot subcommand and lets you drag rectangles
  directly on the image to define exclude/include regions. Each region
  gets a name, role, percent-precise coordinates, and an optional
  Markdown heading level. Reachable from each template card via
  "Edit visually…", and pre-loads the first vault PDF whose path
  matches the template's regex.
- **Per-template card editor.** Templates are now edited as
  structured cards in the settings tab — name, regex, page range,
  per-region rows (name / role / x / y / w / h / headingLevel), plus
  reorder / delete buttons. An "Advanced JSON editor…" modal stays
  available for bulk paste/export.
- **Title-slide promotion.** Pages that contain only heading-sized
  lines (e.g. lecture section dividers like "AI and Knowledge") emit
  as `## Title` instead of `### Page N` + body + divider. Page
  dividers around title slides are also suppressed so the title acts
  as its own divider. Toggleable.
- **Wider bullet detection.** The bullet regex now also catches the
  entire Private Use Area (U+E000–U+F8FF), which is where PowerPoint
  / Word / lecture-slide fonts park their list-icon glyphs. Lines like
  "` Understand …`" with a font-private list icon are now rewritten
  as proper Markdown list items.
- Screenshot helper in `installer.ts` invoking
  `liteparse screenshot <pdf> --target-pages N --output-dir DIR
  --format png --quiet`, used by the visual editor.

### Changed

- Templates JSON textarea is gone from the default settings view — it
  lives behind the new "Advanced JSON editor…" button.

## [0.3.0] - 2026-05-21

### Fixed

- **Reading order was reversed.** LiteParse's textItems use the
  **top-left** coordinate origin (y grows downward), not the PDF
  bottom-left convention. The reflow algorithm sorted descending y
  ("higher y first") and template regions flipped y to "convert" to
  PDF coords — both wrong. Lines were emitted bottom-to-top and
  template excludes hit the wrong band, so the AI-1 slides parse
  came out reversed with banner text at the end of each page. Reflow
  now sorts ascending y and regions use textItem coordinates
  directly. Existing templates do **not** need to be rewritten.

### Added

- **Bullet replacement.** Lines starting with an unparseable bullet
  glyph (`�`, `•`, `●`, `▪`, `▫`, `◦`, `‣`, `⁃`, `▶`, `►`, `◆`, etc.)
  are rewritten with a user-configurable prefix (default `-`) so they
  render as proper Markdown lists. Set empty to disable.
- **Bold / italic detection.** When every textItem on a line uses a
  font name containing "Bold"/"Black"/"Heavy"/"Semibold" or "Italic"/
  "Oblique", the line is wrapped in `**…**`, `*…*`, or `***…***`.
  Mid-line markup is intentionally out of scope. Toggleable
  (default on).
- **Heading detection.** Short lines whose max font size is at least
  `median × multiplier` (default 1.3, configurable) are emitted as
  `## title` or `### title` instead of paragraph text. Toggleable
  (default on).
- Auto-escape leading `#` in paragraph text to avoid accidental
  headings.

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
