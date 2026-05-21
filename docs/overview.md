# Overview

LiteParse PDF Parser lets you parse PDFs from inside Obsidian and place the parsed output into your notes at the exact PDF reference point.

## Core workflow

1. Add a PDF link or embed in a note (for example `![[paper.pdf]]`).
2. Run a parse action from the file menu, editor menu, or command palette.
3. The plugin runs LiteParse locally and inserts a marked parsed block under the matching PDF link.

The inserted block is wrapped with markers:

- `<!-- liteparse:start source="..." -->`
- `<!-- liteparse:end source="..." -->`

Those markers let the plugin replace the same block on re-parse when enabled.

## What this plugin adds on top of LiteParse

- Obsidian-native command/menu integration.
- Link-aware insertion below matching PDF links.
- Fallback sidecar note creation when no linking note exists.
- Readability shaping (reflow mode, heading detection, bullet normalization).
- Single-content mode for continuous document output.
- Per-PDF parsing templates with include/exclude regions.

## Desktop-only design

This plugin is desktop-only because it depends on Node.js and invokes the LiteParse CLI in-process from Obsidian desktop.
