# LiteParse PDF Parser for Obsidian

Parse PDFs directly inside Obsidian and insert readable parsed content exactly where you reference the PDF.

This plugin is a thin, unofficial wrapper around [LiteParse](https://github.com/run-llama/liteparse) by Run Llama / LlamaIndex. It is not the LiteParse project itself and is not endorsed by Run Llama, LlamaIndex, or Obsidian.

## Why use this plugin?

- Keep your PDF-to-notes workflow in Obsidian instead of switching tools.
- Insert parsed content below `![[file.pdf]]` or `[[file.pdf]]` links automatically.
- Improve readability with reflow extraction, heading detection, bullet cleanup, and optional single-content mode.
- Handle hard layouts with per-PDF region templates and a visual template editor.
- Stay local-first: no telemetry, no analytics, and no plugin network calls.

## Quick start

1. Install the plugin (BRAT or manual).
2. In a note, add a PDF link/embed like `![[My PDF.pdf]]`.
3. Run **Parse PDF linked in current note with LiteParse**.
4. Parsed output appears below the matching PDF link.

## Documentation

- [Overview](docs/overview.md)
- [Installation](docs/installation.md)
- [Usage](docs/usage.md)
- [Settings](docs/settings.md)
- [Templates](docs/templates.md)
- [Privacy and limitations](docs/privacy-and-limitations.md)
- [Development and release](docs/development.md)
- [Release workflow](docs/release.md)
- [Community plugin submission status](docs/community-submission.md)

## Project docs

- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)
- [Notice](NOTICE)
- [License](LICENSE)
