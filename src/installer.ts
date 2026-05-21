import { FileSystemAdapter, Notice, Plugin } from "obsidian";
import { spawn } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";

const LITEPARSE_PKG = "@llamaindex/liteparse";

/**
 * Real ESM dynamic import that esbuild cannot statically rewrite into a
 * CommonJS require(). LiteParse is `"type": "module"` with top-level await,
 * so it MUST be loaded via Node's native ESM loader at runtime.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dynamicImport: (s: string) => Promise<any> = new Function(
	"s",
	"return import(s)",
) as never;

export interface PluginPaths {
	pluginDir: string;
	nodeModules: string;
	liteparseEntry: string;
}

export function resolvePluginPaths(plugin: Plugin): PluginPaths {
	const adapter = plugin.app.vault.adapter;
	if (!(adapter instanceof FileSystemAdapter)) {
		throw new Error("LiteParse PDF Parser is desktop-only.");
	}
	const rel = plugin.manifest.dir;
	if (!rel) {
		throw new Error("Could not resolve plugin folder (manifest.dir missing).");
	}
	const pluginDir = adapter.getFullPath(rel);
	const nodeModules = join(pluginDir, "node_modules");
	const liteparseEntry = join(
		nodeModules,
		"@llamaindex",
		"liteparse",
		"dist",
		"src",
		"lib.js",
	);
	return { pluginDir, nodeModules, liteparseEntry };
}

export function isLiteParseInstalled(paths: PluginPaths): boolean {
	return existsSync(paths.liteparseEntry);
}

/**
 * Augment PATH with the typical locations where npm lives on macOS/Linux
 * when Obsidian is launched from the GUI (where the user shell's PATH is
 * not inherited).
 */
function augmentedPath(): string {
	const sep = process.platform === "win32" ? ";" : ":";
	const current = process.env.PATH ?? "";
	const extras =
		process.platform === "win32"
			? [
				"C:\\Program Files\\nodejs",
				"C:\\Program Files (x86)\\nodejs",
			  ]
			: [
				"/usr/local/bin",
				"/opt/homebrew/bin",
				"/usr/bin",
				"/bin",
				`${process.env.HOME ?? ""}/.nvm/versions/node`,
				`${process.env.HOME ?? ""}/.volta/bin`,
				`${process.env.HOME ?? ""}/.fnm`,
				`${process.env.HOME ?? ""}/.local/share/fnm`,
				`${process.env.HOME ?? ""}/.local/bin`,
			  ];
	return [current, ...extras].filter(Boolean).join(sep);
}

/**
 * Ensure a minimal package.json exists in the plugin folder so npm install
 * has somewhere to install to and writes a lock there.
 */
function ensurePackageJson(paths: PluginPaths): void {
	if (!existsSync(paths.pluginDir)) {
		mkdirSync(paths.pluginDir, { recursive: true });
	}
	const pkgPath = join(paths.pluginDir, "package.json");
	if (existsSync(pkgPath)) return;
	const minimal = {
		name: "liteparse-pdf-parser-runtime",
		private: true,
		version: "0.0.0",
		description:
			"Runtime dependencies for the LiteParse PDF Parser Obsidian plugin.",
	};
	writeFileSync(pkgPath, JSON.stringify(minimal, null, 2) + "\n", "utf8");
}

function runCommand(
	cmd: string,
	args: string[],
	cwd: string,
	onLine: (chunk: string) => void,
): Promise<number> {
	return new Promise<number>((resolve, reject) => {
		const env = { ...process.env, PATH: augmentedPath() };
		const child = spawn(cmd, args, {
			cwd,
			env,
			shell: process.platform === "win32",
			stdio: ["ignore", "pipe", "pipe"],
		});
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (s: string) => onLine(s));
		child.stderr.on("data", (s: string) => onLine(s));
		child.on("error", reject);
		child.on("close", (code) => resolve(code ?? 0));
	});
}

/**
 * Try to detect a usable npm command. Returns the executable name (caller
 * runs via spawn with augmented PATH).
 */
function npmCommand(): string {
	return process.platform === "win32" ? "npm.cmd" : "npm";
}

export interface InstallProgress {
	(message: string): void;
}

export async function installLiteParse(
	paths: PluginPaths,
	progress: InstallProgress,
): Promise<void> {
	ensurePackageJson(paths);
	const args = [
		"install",
		"--omit=dev",
		"--no-audit",
		"--no-fund",
		"--no-progress",
		"--loglevel=error",
		`${LITEPARSE_PKG}@latest`,
	];
	progress(`Running: npm ${args.join(" ")}`);
	let stderr = "";
	const code = await runCommand(npmCommand(), args, paths.pluginDir, (chunk) => {
		stderr += chunk;
		const line = chunk.trim().split("\n").pop();
		if (line) progress(line);
	}).catch((err: Error) => {
		throw new Error(
			`Could not launch npm. Is Node.js installed and on your PATH? ` +
			`Underlying error: ${err.message}`,
		);
	});
	if (code !== 0) {
		throw new Error(
			`npm install exited with code ${code}. ` +
			`Last output: ${stderr.trim().slice(-500)}`,
		);
	}
	if (!isLiteParseInstalled(paths)) {
		throw new Error(
			"npm install completed but @llamaindex/liteparse was not found at " +
			paths.liteparseEntry,
		);
	}
}

/**
 * Import LiteParse from the plugin folder via Node's native ESM loader.
 */
export async function importLiteParse(paths: PluginPaths): Promise<unknown> {
	const url = pathToFileURL(paths.liteparseEntry).href;
	const mod = await dynamicImport(url);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const m: any = mod;
	return m.LiteParse ?? m.default?.LiteParse ?? m.default ?? m;
}

/**
 * Ensure LiteParse is installed in the plugin folder, installing it on the
 * fly if needed, then return the LiteParse class.
 */
export async function ensureLiteParse(
	plugin: Plugin,
	debug: boolean,
): Promise<unknown> {
	const paths = resolvePluginPaths(plugin);
	if (!isLiteParseInstalled(paths)) {
		const notice = new Notice(
			"LiteParse: first-run setup — installing LiteParse… this can take a minute.",
			0,
		);
		const onProgress: InstallProgress = (line) => {
			notice.setMessage(`LiteParse setup: ${line}`);
			if (debug) console.debug("[liteparse-pdf-parser][install]", line);
		};
		try {
			await installLiteParse(paths, onProgress);
			notice.setMessage("LiteParse: install complete.");
			setTimeout(() => notice.hide(), 2000);
		} catch (err) {
			notice.hide();
			throw err;
		}
	}
	return importLiteParse(paths);
}
