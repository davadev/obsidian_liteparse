# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Desktop-only Obsidian plugin that wraps [LiteParse](https://github.com/run-llama/liteparse) (Run Llama / LlamaIndex, Apache-2.0) to parse PDFs from inside Obsidian and insert the parsed Markdown directly below the PDF link in the referencing note.

Plugin id: `liteparse-pdf-parser`. Author: `davadev`. License: Apache-2.0 (matches upstream LiteParse).

## Commands

```bash
npm install            # install dev deps; runtime LiteParse auto-installs into plugin folder on first parse
npm run dev            # esbuild watch into ./main.js (link/copy to <vault>/.obsidian/plugins/liteparse-pdf-parser/)
npm run build          # tsc --noEmit then esbuild production (minified, no sourcemap)
npm run typecheck      # tsc --noEmit
npm version <X.Y.Z> --no-git-tag-version   # bumps package.json + manifest.json + versions.json via version-bump.mjs
```

No test suite exists. Verification is `typecheck` + `build` + manual parse in a real vault.

## Build / release pipeline

- Bundle: esbuild, CJS, `es2020`, `platform: "node"`, entry `src/main.ts` → `main.js` at repo root.
- Externalized at build time: `obsidian`, `electron`, all `@codemirror/*`, all `@lezer/*`, Node builtins, and **`@llamaindex/liteparse`**. LiteParse is ESM with top-level await and ships native deps (`sharp`, `@hyzyla/pdfium`, `tesseract.js`) — it cannot be bundled into a CJS plugin and must stay external.
- Release artifacts are exactly three files at repo root: `main.js`, `manifest.json`, `styles.css`. These are what BRAT and the Obsidian registry expect.
- Three version fields must agree: `package.json#version`, `manifest.json#version`, `versions.json[<version>]`. `version-bump.mjs` (run by `npm version`'s `version` script) keeps `manifest.json` + `versions.json` in sync with `package.json`.
- `.github/workflows/release.yml` fires on tag push matching `[0-9]+.[0-9]+.[0-9]+` (no `v` prefix). It is **idempotent**: if a release for the tag exists it `gh release upload --clobber`s, otherwise it `gh release create`s. Full process documented in `docs/release.md`.
- `.github/workflows/ci.yml` runs `typecheck` + `build` + artifact existence check on push/PR to `main`.

## Architecture

### Runtime trap: LiteParse runs in a subprocess, not in-process

Obsidian's renderer is Electron, which **refuses dynamic `import()` of `file://` URLs**. Early versions tried in-process import and hit `Failed to fetch dynamically imported module`. The plugin now spawns the LiteParse CLI as a Node child process and reads JSON from stdout:

```
node <pluginDir>/node_modules/@llamaindex/liteparse/dist/src/index.js parse <pdf> --format json --quiet [flags]
```

All LiteParse interaction lives in `src/parser.ts` (`runLiteParseCli`) and `src/installer.ts` (`ensureLiteParse`, `liteparseScreenshot`). Do not try to import `@llamaindex/liteparse` from anywhere else — the import will appear to work at typecheck time and fail at runtime.

`installer.ts#augmentedPath()` prepends Homebrew, `/usr/local/bin`, nvm/volta/fnm paths because GUI-launched Obsidian inherits a stripped `PATH` and otherwise can't find `node` or `npm`.

### Entry points → parse pipeline

`src/main.ts` registers three Obsidian hooks. All of them funnel into `parsePdf` in `src/parser.ts`:

- `file-menu` on PDFs → "Parse PDF with LiteParse" (+ "(choose template)…" when templates exist)
- `editor-menu` on Markdown → "Parse linked PDF with LiteParse"
- Command palette: `parse-pdf-in-current-note`, `parse-selected-or-current-pdf`, `parse-pdf-with-template`

`parsePdf(plugin, absolutePath, pdfVaultPath, settings, templateOverride?)`:
1. `ensureLiteParse` (install if missing).
2. Build CLI args from settings (OCR, max-pages, target-pages).
3. Spawn CLI, parse JSON stdout.
4. `renderMarkdownFromPages` turns LiteParse pages into Markdown using the selected template + readability settings.
5. Caller (`main.ts` → `noteInsertion.ts`) inserts the result between `<!-- liteparse:start source="…" -->` / `<!-- liteparse:end source="…" -->` markers, replacing any existing block when `replaceExistingParsedBlock` is on, or creates a fallback sidecar note when no linking note is found.

`templateOverride` semantics: `undefined` = auto-match by regex, `null` = force no template, `ParsingTemplate` = use this template, bypass regex.

### Templates and coordinate system

`src/templates.ts` owns region geometry. Critical detail: **LiteParse textItems use TOP-LEFT origin (y grows downward), not the PDF bottom-left convention**. The reflow algorithm sorts ascending y (top first) and `regionToPdfRect` uses textItem coords directly — do not "flip" y. This was the root cause of the 0.2.0 reversed-reading-order bug fixed in 0.3.0.

Templates have:
- `match` regex against vault-relative PDF path
- optional page range
- `include` regions (column / section bounds, optional `headingLevel`)
- `exclude` regions (headers/footers/page-number bands)

`applyTemplateToPage` filters all items through every exclude rectangle first, then bins survivors into includes. Excludes nested inside includes work as expected (verified in 0.4.1).

Coordinates are percent-based (0–100) with top-left origin. The visual editor (`src/visualEditor.ts`) screenshots a PDF page via `liteparseScreenshot` and lets the user drag rectangles on the image; output is percent coords.

### Readability shaping

`renderMarkdownFromPages` (in `parser.ts`) and `renderPage` (in `templates.ts`) apply, in order:
- reflow (group textItems by y-proximity into visual lines, sort by x within line)
- bullet glyph replacement — `BULLET_REGEX` includes the entire Private Use Area `\u{E000}-\u{F8FF}` because PowerPoint/Word/lecture fonts park list icons there
- bold/italic detection from font name keywords
- heading detection (line max font size ≥ document-median × multiplier)
- `mergeConsecutiveHeadingsInBody` joins same-level headings separated by any number of blank lines (slide titles wrapped to two `####` lines become one)
- `collapseBlankLines`
- title-slide promotion (lone heading-only page → `## Title` with no `### Page N` chrome)
- single-content mode: no `### Page N`, no `---` divider, no title promotion — one flowing document

`applyBulletReplacement` returns `null` when the line has only a bullet glyph and no text after it, and `emitLines` skips nulls. This prevents orphan `- ` lines from decorative glyphs in banner regions.

### Settings persistence

`src/types.ts` holds `LiteParsePluginSettings` + `DEFAULT_SETTINGS`. `src/settings.ts` is the settings tab, including per-template card editor and the "Edit visually…" entry into the visual editor. Settings affected by single-content mode (`includePageHeadings`, `pageDivider`, `promoteTitleSlides`) are grayed out via `.liteparse-setting-disabled` when single-content mode is on.

## Documentation map

User-facing docs live in `docs/` and are linked from `README.md`:
- `overview.md`, `installation.md`, `usage.md`, `settings.md`, `templates.md`, `privacy-and-limitations.md`
- `development.md` — local dev quick-start + source layout
- `release.md` — full release workflow, BRAT integration, recovery, pre-release checklist
- `community-submission.md` — Obsidian community plugin submission status

`CHANGELOG.md` follows Keep a Changelog. `THIRD_PARTY_NOTICES.md` and `NOTICE` credit LiteParse / Run Llama / LlamaIndex.
