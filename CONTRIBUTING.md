# Contributing

Thanks for the interest. This is a small open-source project; contributions
are welcome.

## Ground rules

- Be respectful. Disagreements are fine; rudeness is not.
- Keep PRs focused. One feature or fix per PR.
- New behavior needs a short note in `CHANGELOG.md` under `[Unreleased]`.
- This plugin is desktop-only by design — please do not add code paths that
  depend on Obsidian mobile.

## Development

```bash
npm install
npm run dev    # watch build
npm run build  # production build (typecheck + bundle)
```

Symlink `main.js`, `manifest.json`, and `styles.css` into a real vault's
`.obsidian/plugins/liteparse-pdf-parser/` folder to test inside Obsidian.

## Project layout

See `README.md → Development → Source layout`.

## Coding style

- TypeScript strict mode is on.
- 4-space tabs (matches the Obsidian sample plugin convention) — see
  `.editorconfig`.
- Keep `main.ts` small. Pure logic lives in `output.ts`, `linkDetection.ts`,
  `noteInsertion.ts`, etc.
- Prefer Obsidian's Vault API for any file I/O. Do **not** touch the user's
  vault with `fs` directly.

## Reporting bugs

Please include:

- Obsidian version.
- OS and architecture.
- Plugin version.
- A short reproduction (a tiny test PDF helps a lot).
- Console errors from **Developer Tools → Console**.

## Pull requests

- Open against `main`.
- CI must pass.
- If you modify behavior visible to end users, update `README.md`.
