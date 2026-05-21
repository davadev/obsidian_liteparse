# LiteParse PDF Parser for Obsidian

Parse PDFs inside Obsidian using
[LiteParse](https://github.com/run-llama/liteparse) (by
[Run Llama / LlamaIndex](https://www.llamaindex.ai/)) and insert the parsed
Markdown directly below the PDF link/embed in the note that references it.

> **This plugin is a thin, unofficial wrapper around LiteParse.** It is not
> the LiteParse project itself, and it is not endorsed by Run Llama,
> LlamaIndex, or Obsidian. All credit for the actual parsing belongs to the
> LiteParse authors.

---

## Screenshots / demo

_Placeholder — a GIF/screenshot will be added before community submission._

```
# Research

![[My PDF.pdf]]

<!-- liteparse:start source="My PDF.pdf" -->

## Parsed PDF content

> Parsed with [LiteParse](https://github.com/run-llama/liteparse) by Run Llama / LlamaIndex.

Parsed on: 2026-05-21 09:42

### Page 1
…

<!-- liteparse:end source="My PDF.pdf" -->
```

## Features

- Right-click a PDF in the file explorer → **Parse PDF with LiteParse**.
- Command palette: **Parse PDF linked in current note with LiteParse**.
- Command palette: **Parse selected/current PDF with LiteParse**.
- Editor menu: **Parse linked PDF with LiteParse** while viewing a note.
- Inserts the parsed output directly below the PDF link/embed in the note
  that references the PDF. Existing parsed blocks for the same PDF can be
  replaced automatically.
- Fallback: if no note in the vault links the selected PDF, a separate
  `<name>.parsed.md` note is created (optional, on by default).
- Supports `![[file.pdf]]`, `[[file.pdf]]`, `[label](file.pdf)`,
  URL-encoded paths, and aliased wikilinks.
- Pluggable LiteParse options: OCR, OCR language, page range, max pages,
  parse timeout.
- 100% local. No network calls, no telemetry, no analytics.

## Requirements

- Obsidian desktop (Windows / macOS / Linux).
- **Node.js + npm on your PATH.** The plugin invokes `npm install` once,
  on first use, to fetch LiteParse into the plugin folder. LiteParse
  cannot be bundled (ESM with top-level await + native modules), so it
  is installed at runtime instead. If you don't have Node, install it
  from <https://nodejs.org/> (LTS is fine).

> **Desktop only.** This plugin is desktop-only because it uses the native
> Node version of LiteParse. Obsidian mobile is not supported.

## Installation

### Official Community Plugins

Coming after approval. See
[Community Plugin Submission Status](#community-plugin-submission-status).

### Via BRAT (beta)

1. Install **BRAT** from Obsidian's Community Plugins.
2. Open BRAT settings → **Add Beta plugin**.
3. Paste this repository URL:

   ```
   https://github.com/davadev/obsidian_liteparse
   ```

4. Enable **LiteParse PDF Parser** in **Settings → Community plugins**.

### Manual install

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest
   GitHub release.
2. Create a folder
   `<vault>/.obsidian/plugins/liteparse-pdf-parser/` and drop the three
   files into it.
3. Enable the plugin in **Settings → Community plugins**.
4. The first time you parse a PDF, the plugin runs `npm install
   @llamaindex/liteparse` into the plugin folder automatically. You'll
   see a notice while this happens. Subsequent parses are instant.

If the auto-install fails (e.g. `npm` is not on PATH), open a terminal
and run it manually:

```bash
cd <vault>/.obsidian/plugins/liteparse-pdf-parser
npm install --omit=dev @llamaindex/liteparse@latest
```

## Usage

The primary workflow:

1. You have a Markdown note that links/embeds a PDF, e.g.
   `![[My PDF.pdf]]`.
2. Right-click the PDF in the file explorer and choose
   **Parse PDF with LiteParse**, or run the command from inside the note.
3. The plugin parses the PDF locally with LiteParse and inserts a parsed
   block directly below the matching link/embed.

Fallbacks:

- If multiple notes link the same PDF, the plugin opens a chooser.
- If the PDF is not linked anywhere, the plugin writes a separate
  `<name>.parsed.md` note next to the PDF (toggleable in settings).
- If the current note contains multiple PDF links, the plugin opens a
  chooser for the link.

### Supported PDF link formats

| Form | Example |
|---|---|
| Wiki embed | `![[file.pdf]]` |
| Wiki embed with folder | `![[folder/file.pdf]]` |
| Wiki link | `[[file.pdf]]` |
| Wiki link with alias | `![[file.pdf\|Alias]]` |
| Markdown link | `[label](file.pdf)` |
| Markdown link with folder | `[label](attachments/file.pdf)` |
| URL-encoded spaces | `[label](My%20PDF.pdf)` |

`.pdf` matching is case-insensitive.

## Settings

| Setting | Default | Description |
|---|---|---|
| Replace existing parsed block | `true` | Replace an existing parsed block for the same PDF instead of appending. |
| Open note after parsing | `true` | Focus the target note when parsing finishes. |
| Include LiteParse attribution in note | `true` | Inserts a one-line credit linking to LiteParse. |
| Include parsed timestamp | `true` | Adds a `Parsed on: …` line to each parsed block. |
| Parsed content heading | `Parsed PDF content` | Heading used for the parsed block. |
| Output format | `markdown` | `markdown`, `text`, or `json`. |
| Create separate parsed note when no linking note found | `true` | Fallback to a sidecar `.parsed.md`. |
| Fallback note location | `same-folder` | Same folder as the PDF, or a custom folder. |
| OCR | `false` | Enable LiteParse OCR for scanned PDFs. Slower. |
| OCR language | `en` | Tesseract ISO 639-3 (or 639-1) code. |
| Max pages | _(unset)_ | Cap the number of pages parsed. |
| Page range | _(unset)_ | e.g. `1-3,5,7-9`. |
| Parse timeout | `300` (sec) | Abort parsing if it does not finish in time. |
| Include LiteParse JSON in note | `false` | Append the raw JSON inside a `<details>` block. |
| Debug logging | `false` | Log parser options and result shape to the dev console. |

## Limitations

- Desktop only.
- Large PDFs may take time, especially with OCR.
- Parsing quality depends on LiteParse.
- If multiple notes reference the same PDF, you may be prompted to choose
  the target note.
- LiteParse currently produces text/JSON, not native Markdown — this
  plugin assembles Markdown by stitching per-page text with `### Page N`
  headings. The original layout is approximated, not reproduced.

## Privacy

- Parsing is entirely local — LiteParse runs inside your Obsidian process.
- This plugin makes **no network requests**.
- No telemetry. No analytics. No background processing.
- If you enable OCR, Tesseract runs locally too (LiteParse may download
  a Tesseract trained-data file the first time it is invoked for a given
  language — that download is performed by LiteParse, not by this plugin).

## Attribution

This plugin wraps **[LiteParse](https://github.com/run-llama/liteparse)**
by **Run Llama / LlamaIndex**. Huge thanks to the LiteParse authors and
the LlamaIndex team for releasing it under an open-source license — none
of this would exist without their work.

See [`NOTICE`](NOTICE) and [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## License

Apache License 2.0 — see [`LICENSE`](LICENSE). Chosen to match the
upstream LiteParse license for simplicity and compatibility.

## Development

```bash
# install
npm install

# dev: watch + rebuild main.js on change
npm run dev

# production build
npm run build

# typecheck only
npm run typecheck
```

Source layout:

```
src/
  main.ts            entry point — registers commands and menu items
  settings.ts        settings tab
  parser.ts          LiteParse adapter + absolute-path resolver
  output.ts          parsed block formatter + marker detection
  noteInsertion.ts   inserts/replaces parsed blocks in notes
  linkDetection.ts   PDF link/embed detection inside notes
  suggestModals.ts   modals for picking PDF / note / link
  types.ts           plugin types + DEFAULT_SETTINGS
```

## Release

1. Bump `version` in `package.json` (SemVer).
2. Run `npm version <new>` — this also patches `manifest.json` and
   `versions.json` via `version-bump.mjs`.
3. `npm run build`.
4. Create a GitHub release whose **tag name equals the manifest
   `version`** (no `v` prefix). Upload `main.js`, `manifest.json`, and
   `styles.css` as release assets.

## Community Plugin Submission Status

Not yet submitted. Checklist before submission:

- [ ] Tested locally in Obsidian desktop on at least one real PDF.
- [ ] Tested via BRAT install path end-to-end.
- [ ] Release created with `main.js`, `manifest.json`, `styles.css`
      attached as individual files (not zipped).
- [ ] `manifest.json` reviewed: `id`, `name`, `description`,
      `isDesktopOnly`, `minAppVersion`.
- [ ] `versions.json` reviewed.
- [ ] Plugin `id` checked for uniqueness on the official
      [community-plugins.json](https://github.com/obsidianmd/obsidian-releases/blob/master/community-plugins.json).
- [ ] [Developer policies](https://docs.obsidian.md/Plugins/Releasing/Developer+policies)
      reviewed.
- [ ] [Submission requirements](https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins)
      reviewed.

Submission process (manual; not performed automatically by this repo):

1. Open
   <https://github.com/obsidianmd/obsidian-releases/blob/master/community-plugins.json>.
2. Add an entry with this plugin's `id`, `name`, `author`, `description`,
   and `repo` (`davadev/obsidian_liteparse`).
3. Submit a PR following Obsidian's submission template.
4. Address review feedback from the Obsidian team.
