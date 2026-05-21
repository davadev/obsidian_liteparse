# Installation

## Requirements

- Obsidian desktop on Windows, macOS, or Linux.
- Node.js and npm available on `PATH`.

The plugin auto-installs `@llamaindex/liteparse` on first parse, because LiteParse is loaded at runtime.

## Install via BRAT (beta)

1. Install BRAT from Obsidian Community Plugins.
2. Open BRAT settings and choose **Add Beta plugin**.
3. Use this repository URL:

```text
https://github.com/davadev/obsidian_liteparse
```

4. Enable **LiteParse PDF Parser** in Obsidian plugin settings.

## Manual install

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release.
2. Create `<vault>/.obsidian/plugins/liteparse-pdf-parser/`.
3. Put those three files into that folder.
4. Enable the plugin in Obsidian.

On the first parse action, the plugin runs:

```bash
npm install --omit=dev --no-audit --no-fund --no-progress --loglevel=error @llamaindex/liteparse@latest
```

inside the plugin folder.

## If first-run install fails

Run this manually:

```bash
cd <vault>/.obsidian/plugins/liteparse-pdf-parser
npm install --omit=dev @llamaindex/liteparse@latest
```

Common causes:

- Node.js or npm not installed.
- `npm` not available in environment `PATH` seen by Obsidian.
