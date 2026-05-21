# Privacy and limitations

## Privacy

- Parsing runs locally via LiteParse inside Obsidian desktop.
- This plugin does not send telemetry or analytics.
- This plugin does not perform background syncing or external API calls.

If OCR is enabled, LiteParse may download language data for Tesseract depending on environment and selected language.

## Limitations

- Desktop-only; Obsidian mobile is not supported.
- Parsing quality depends on source PDF quality and LiteParse behavior.
- Large PDFs and OCR-enabled parses can be slow.
- Layout is approximated into readable markdown/text, not pixel-perfect PDF reconstruction.
- If multiple notes or multiple links match, a chooser prompt is expected behavior.
