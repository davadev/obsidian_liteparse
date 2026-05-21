import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

const banner = `/*
LiteParse PDF Parser — Obsidian plugin.
Built artifact. Source: https://github.com/davadev/obsidian_liteparse
*/`;

const prod = process.argv[2] === "production";

const context = await esbuild.context({
  banner: { js: banner },
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    // LiteParse + native deps stay external; they load lazily at runtime
    // via dynamic import. The plugin install README explains the user-
    // facing install steps. The package itself uses top-level await so it
    // cannot be bundled into a CommonJS Obsidian plugin.
    "@llamaindex/liteparse",
    ...builtins,
  ],
  format: "cjs",
  target: "es2020",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  platform: "node",
  minify: prod,
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
