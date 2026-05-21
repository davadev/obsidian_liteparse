import { FileSystemAdapter, Plugin, TFile, Vault } from "obsidian";
import { spawn } from "child_process";
import { LiteParsePluginSettings, ParsingTemplate } from "./types";
import {
	augmentedPath,
	ensureLiteParse,
	nodeCommand,
	PluginPaths,
} from "./installer";
import {
	computeBaseFontSize,
	pageNumberOf,
	RawPage,
	renderPage,
	selectTemplate,
	templatePageFilter,
} from "./templates";

export interface NormalizedParseResult {
	/** Markdown-ready content for insertion into a note. */
	markdown: string;
	/** Plain text extraction. */
	text: string;
	/** Optional structured JSON (raw LiteParse output). */
	json: unknown | null;
	/** Number of pages parsed if known. */
	pageCount: number | null;
}

/**
 * Resolve absolute filesystem path for a TFile on desktop only.
 * Throws if the vault adapter is not a FileSystemAdapter.
 */
export function getAbsolutePath(vault: Vault, file: TFile): string {
	const adapter = vault.adapter;
	if (!(adapter instanceof FileSystemAdapter)) {
		throw new Error(
			"LiteParse PDF Parser requires the desktop filesystem adapter. " +
			"This plugin is desktop-only and cannot run on Obsidian mobile.",
		);
	}
	return adapter.getFullPath(file.path);
}


function normalizePageRange(spec: string, maxPages: number | null): string | null {
	const trimmed = spec.trim();
	if (!trimmed) return null;
	if (!maxPages || maxPages <= 0) return trimmed;
	const parts: string[] = [];
	for (const part of trimmed.split(",")) {
		const seg = part.trim();
		if (!seg) continue;
		const range = seg.split("-").map((s) => s.trim());
		if (range.length === 1) {
			const n = Number(range[0]);
			if (Number.isFinite(n) && n > 0 && n <= maxPages) parts.push(String(Math.floor(n)));
		} else if (range.length === 2) {
			const a = Number(range[0]);
			const b = Number(range[1]);
			if (Number.isFinite(a) && Number.isFinite(b)) {
				const lo = Math.max(1, Math.floor(Math.min(a, b)));
				const hi = Math.min(maxPages, Math.floor(Math.max(a, b)));
				if (hi >= lo) parts.push(`${lo}-${hi}`);
			}
		}
	}
	return parts.length ? parts.join(",") : null;
}

function buildCliArgs(
	pdfAbsolutePath: string,
	settings: LiteParsePluginSettings,
): string[] {
	const args: string[] = ["parse", pdfAbsolutePath, "--format", "json", "--quiet"];
	if (!settings.ocrEnabled) {
		args.push("--no-ocr");
	} else if (settings.ocrLanguage && settings.ocrLanguage.trim()) {
		args.push("--ocr-language", settings.ocrLanguage.trim());
	}
	if (settings.maxPages && settings.maxPages > 0) {
		args.push("--max-pages", String(settings.maxPages));
	}
	const range = normalizePageRange(settings.pageRange, settings.maxPages);
	if (range) args.push("--target-pages", range);
	return args;
}

function runLiteParseCli(
	paths: PluginPaths,
	args: string[],
	timeoutSeconds: number,
	debug: boolean,
): Promise<{ stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		const env = { ...process.env, PATH: augmentedPath() };
		const child = spawn(
			nodeCommand(),
			[paths.liteparseCli, ...args],
			{
				cwd: paths.pluginDir,
				env,
				shell: process.platform === "win32",
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		let stdout = "";
		let stderr = "";
		let timedOut = false;
		const timer =
			timeoutSeconds > 0
				? setTimeout(() => {
					timedOut = true;
					child.kill("SIGKILL");
				}, timeoutSeconds * 1000)
				: null;
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (c: string) => {
			stdout += c;
		});
		child.stderr.on("data", (c: string) => {
			stderr += c;
			if (debug) console.debug("[liteparse-pdf-parser][cli]", c.trim());
		});
		child.on("error", (err) => {
			if (timer) clearTimeout(timer);
			reject(
				new Error(
					`Could not launch Node to run LiteParse. Is Node.js installed and on PATH? ` +
					`Underlying error: ${err.message}`,
				),
			);
		});
		child.on("close", (code) => {
			if (timer) clearTimeout(timer);
			if (timedOut) {
				reject(new Error(`LiteParse timed out after ${timeoutSeconds}s`));
				return;
			}
			if (code !== 0) {
				reject(
					new Error(
						`LiteParse exited with code ${code}. ` +
						(stderr.trim() ? stderr.trim().slice(-500) : "No stderr output."),
					),
				);
				return;
			}
			resolve({ stdout, stderr });
		});
	});
}

function collapseBlankLines(text: string): string {
	return text
		.split("\n")
		.map((line) => line.replace(/[ \t]+$/g, ""))
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

function renderMarkdownFromPages(
	pages: RawPage[],
	settings: LiteParsePluginSettings,
	pdfVaultPath: string,
	templateOverride: ParsingTemplate | null | undefined,
): string {
	const template =
		templateOverride === undefined
			? selectTemplate(settings.templates, pdfVaultPath)
			: templateOverride;
	const templatePages = templatePageFilter(template);
	const baseFontSize = computeBaseFontSize(pages);
	const divider = (settings.pageDivider ?? "").trim();
	const blocks: string[] = [];
	let idx = 0;
	for (const page of pages) {
		idx++;
		const num = pageNumberOf(page, idx);
		const sections = renderPage(page, template, settings, baseFontSize, templatePages);
		if (sections.length === 0) continue;
		const parts: string[] = [];
		if (settings.includePageHeadings) {
			parts.push(`### Page ${num}`);
		}
		for (const section of sections) {
			if (section.heading) parts.push(section.heading);
			let body = section.body;
			if (settings.collapseBlankLines) body = collapseBlankLines(body);
			parts.push(body);
		}
		blocks.push(parts.join("\n\n"));
	}
	const joiner = divider ? `\n\n${divider}\n\n` : "\n\n";
	let out = blocks.join(joiner);
	if (settings.collapseBlankLines) out = collapseBlankLines(out);
	return out;
}

export async function parsePdf(
	plugin: Plugin,
	absolutePath: string,
	pdfVaultPath: string,
	settings: LiteParsePluginSettings,
	templateOverride?: ParsingTemplate | null,
): Promise<NormalizedParseResult> {
	const paths = await ensureLiteParse(plugin, settings.debugLogging);
	const args = buildCliArgs(absolutePath, settings);

	if (settings.debugLogging) {
		console.debug("[liteparse-pdf-parser] CLI:", nodeCommand(), paths.liteparseCli, args);
	}

	const { stdout } = await runLiteParseCli(
		paths,
		args,
		settings.parseTimeoutSeconds,
		settings.debugLogging,
	);

	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(
			`LiteParse output was not valid JSON: ${msg}. ` +
			`First 200 chars: ${stdout.slice(0, 200)}`,
		);
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const r: any = parsed;
	const pages: RawPage[] = Array.isArray(r.pages) ? r.pages : [];
	const markdown = renderMarkdownFromPages(pages, settings, pdfVaultPath, templateOverride);
	const text: string =
		typeof r.text === "string"
			? r.text
			: pages.map((p) => (p.text ?? "").trim()).filter(Boolean).join("\n\n");
	const pageCount = pages.length || (typeof r.pageCount === "number" ? r.pageCount : null);

	return { markdown, text, json: r, pageCount };
}
