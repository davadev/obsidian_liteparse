# Development and release

## Local development

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

Typecheck only:

```bash
npm run typecheck
```

To test inside Obsidian, link or copy `main.js`, `manifest.json`, and `styles.css` into a vault plugin folder:

```text
<vault>/.obsidian/plugins/liteparse-pdf-parser/
```

## Source layout

```text
src/
  main.ts            entry point: commands + menu handlers
  settings.ts        settings tab and template editors
  parser.ts          LiteParse CLI invocation + output shaping
  output.ts          parsed block formatter + marker handling
  noteInsertion.ts   insertion/replacement in target notes
  linkDetection.ts   PDF link detection and resolution
  suggestModals.ts   selection modals (PDF/note/link/template)
  visualEditor.ts    visual region editor for templates
  templates.ts       template selection and region/page processing
  installer.ts       first-run LiteParse install + screenshot helper
  types.ts           settings/types/defaults
```

## Release flow

See [Release workflow](release.md) for the full process, the CI/Release pipeline, BRAT integration, and the pre-release checklist.

Short version:

1. Update `CHANGELOG.md`.
2. `npm version <new> --no-git-tag-version` (bumps `package.json`, `manifest.json`, `versions.json`).
3. `npm run build`.
4. Commit + push to `main`, wait for CI.
5. Tag `X.Y.Z` (no `v` prefix) and push the tag — the Release workflow builds and publishes the GitHub release with `main.js`, `manifest.json`, `styles.css`.
