# Usage

## Parse entry points

- File explorer PDF context menu: `Parse PDF with LiteParse`.
- File explorer PDF context menu (when templates exist): `Parse PDF with LiteParse (choose template)...`.
- Editor menu in Markdown notes: `Parse linked PDF with LiteParse`.
- Command palette:
  - `Parse PDF linked in current note with LiteParse`
  - `Parse selected/current PDF with LiteParse`
  - `Parse PDF with LiteParse (choose template)...`

## Typical behavior

When parsing from a Markdown note:

- If one PDF link exists, it parses that PDF.
- If multiple PDF links exist, the plugin asks which link to use.

When parsing a PDF file directly:

- If one note links that PDF, output is inserted into that note.
- If multiple notes link that PDF, the plugin asks you to choose the note.
- If no notes link that PDF, fallback sidecar note behavior applies (if enabled).

## Supported PDF link forms

- `![[file.pdf]]`
- `![[folder/file.pdf]]`
- `[[file.pdf]]`
- `![[file.pdf|Alias]]`
- `[label](file.pdf)`
- `[label](attachments/file.pdf)`
- URL-encoded targets like `[label](My%20PDF.pdf)`

Extension matching for `.pdf` is case-insensitive.

## Fallback sidecar notes

If no linking note is found while parsing a PDF from the explorer, the plugin can create a sidecar note named `<pdf>.parsed.md`.

Location options:

- same folder as the PDF
- custom vault folder
