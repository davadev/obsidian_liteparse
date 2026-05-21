# Settings

Defaults reflect `DEFAULT_SETTINGS` in `src/types.ts`.

## General output

| Setting | Default | Description |
|---|---|---|
| Replace existing parsed block | `true` | Replace an existing parsed block for the same PDF instead of appending a new block. |
| Open note after parsing | `true` | Open/focus the target note when parsing completes. |
| Include LiteParse attribution in note | `true` | Add a credit line in each parsed block. |
| Include parsed timestamp | `true` | Add a `Parsed on: ...` line. |
| Parsed content heading | `Parsed PDF content` | Heading text used at the top of each parsed block. |
| Output format | `markdown` | `markdown`, `text`, or `json`. |
| Include LiteParse JSON in note | `false` | In markdown mode, append raw LiteParse JSON in a collapsible `<details>` section. |

## Readability

| Setting | Default | Description |
|---|---|---|
| Single-content mode | `false` | Emit one continuous document, removing per-page headings/dividers and title-slide promotion. |
| Extraction mode | `reflow` | `reflow` rebuilds reading flow from positioned text items; `raw` uses page text directly. |
| Include page headings | `true` | Insert `### Page N` before each page's output. Disabled when single-content mode is on. |
| Page divider | `---` | Divider inserted between pages. Disabled when single-content mode is on. |
| Collapse blank lines | `true` | Collapse runs of 3+ blank lines and trim trailing whitespace. |
| Auto-detect two-column layouts | `true` | Conservative two-column detection. Runs only when a template hasn't already split the page into two include regions. See `docs/templates.md` for the safety gates. |

## Markup detection

| Setting | Default | Description |
|---|---|---|
| Bullet replacement | `-` | Replace unsupported bullet glyphs at line start with this marker (plus space). Empty disables replacement. |
| Detect bold / italic | `true` | Wrap full lines in markdown emphasis when all line items indicate bold/italic font styling. |
| Detect headings | `true` | Promote short large-font lines to markdown headings. |
| Heading size multiplier | `1.3` | Heading candidate threshold is median font size multiplied by this value. |
| Promote title-only slides | `true` | Pages made only of heading-like lines become `## Title` blocks. Disabled when single-content mode is on. |
| Merge consecutive same-level headings | `true` | Joins adjacent same-level headings (including across blank lines). |

## Fallback note behavior

| Setting | Default | Description |
|---|---|---|
| Create separate parsed note when no linking note is found | `true` | Create `<pdf>.parsed.md` when parsing a PDF with no note references. |
| Fallback note location | `same-folder` | `same-folder` or `custom-folder`. |
| Custom fallback folder | `""` | Vault-relative path used only when `custom-folder` is selected. |

## Advanced LiteParse options

| Setting | Default | Description |
|---|---|---|
| OCR | `false` | Enable OCR for text-sparse/scanned PDFs. |
| OCR language | `en` | Tesseract language code. |
| Max pages | `null` | Optional page limit. |
| Page range | `""` | Optional page selection like `1-3,5,7-9`. |
| Parse timeout (seconds) | `300` | Kill parse process if it exceeds timeout. |
| Debug logging | `false` | Log parse command details and result shape in developer console. |

## Parsing templates

- Stored as `templates` setting, default `[]`.
- First template whose regex matches the PDF vault path is used.
- You can edit templates as cards, via visual editor, or in advanced JSON editor.

See `docs/templates.md` for template details.
