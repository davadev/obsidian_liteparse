# Security policy

## Reporting a vulnerability

If you find a security issue in this plugin, please **do not** open a public
GitHub issue. Instead:

1. Go to <https://github.com/davadev/obsidian_liteparse/security/advisories/new>
   and file a private security advisory.
2. Include a description, repro steps, affected version(s), and any
   suggested mitigation.

You should expect an initial acknowledgement within a reasonable timeframe.

## Scope

In scope:

- This plugin's own code (`src/`, build config, release artifacts).
- Issues caused by how this plugin invokes LiteParse, reads vault files,
  or inserts content into notes.

Out of scope:

- Vulnerabilities in LiteParse itself — please report those upstream at
  <https://github.com/run-llama/liteparse/security>.
- Vulnerabilities in Obsidian itself — please report those to
  <https://obsidian.md/security>.

## Privacy

This plugin does not make network requests, does not collect telemetry,
and does not send any vault contents to remote services. If you observe
network traffic originating from this plugin, please treat it as a bug
and file a security advisory.
