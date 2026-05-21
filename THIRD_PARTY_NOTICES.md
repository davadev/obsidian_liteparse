# Third-party notices

This Obsidian plugin links against the following third-party software.
Each component is the property of its respective owners and is used in
accordance with its license.

## LiteParse (`@llamaindex/liteparse`)

- Project: LiteParse
- Maintainer: Run Llama / LlamaIndex
- Source: https://github.com/run-llama/liteparse
- npm: https://www.npmjs.com/package/@llamaindex/liteparse
- Docs: https://developers.llamaindex.ai/liteparse/
- License: Apache License, Version 2.0
- Role in this plugin: performs the actual PDF parsing. This Obsidian
  plugin is a thin wrapper that invokes LiteParse from inside Obsidian
  and inserts the result into the user's Markdown notes.

Thanks to the LiteParse authors and the LlamaIndex / Run Llama team for
making LiteParse available under an open-source license. This plugin would
not exist without their work.

## Obsidian API (`obsidian`)

- Source: https://github.com/obsidianmd/obsidian-api
- Used as a build-time type dependency only.

## Transitive dependencies of LiteParse

LiteParse itself depends on a number of open-source packages
(`@hyzyla/pdfium`, `tesseract.js`, `sharp`, `zod`, `axios`,
`commander`, `unified`, `p-limit`, `file-type`, `form-data`,
and others). Their licenses apply to the binaries they ship as
part of LiteParse and are not reproduced here. Run
`npm ls --all --long` inside this plugin's source tree to inspect
the full dependency graph and each package's declared license.

---

If you believe an attribution is missing or incorrect, please open an
issue at https://github.com/davadev/obsidian_liteparse/issues.
