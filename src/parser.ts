import { FileSystemAdapter, Notice, TFile, Vault } from "obsidian";
import { LiteParsePluginSettings } from "./types";

export interface NormalizedParseResult {
	/** Markdown-ready content for insertion into a note. */
	markdown: string;
	/** Plain text extraction. */
	text: string;
	/** Optional structured JSON (raw or normalized). */
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

interface ParseConstructorOptions {
	ocrEnabled?: boolean;
	ocrLanguage?: string | string[];
	outputFormat?: "json" | "text";
	maxPages?: number;
	targetPages?: number[];
}

function parsePageRange(spec: string, maxPages: number | null): number[] | undefined {
	const trimmed = spec.trim();
	if (!trimmed) return undefined;
	const pages = new Set<number>();
	for (const part of trimmed.split(",")) {
		const seg = part.trim();
		if (!seg) continue;
		const range = seg.split("-").map((s) => s.trim());
		if (range.length === 1) {
			const n = Number(range[0]);
			if (Number.isFinite(n) && n > 0) pages.add(Math.floor(n));
		} else if (range.length === 2) {
			const a = Number(range[0]);
			const b = Number(range[1]);
			if (Number.isFinite(a) && Number.isFinite(b)) {
				const lo = Math.max(1, Math.floor(Math.min(a, b)));
				const hi = Math.floor(Math.max(a, b));
				for (let n = lo; n <= hi; n++) pages.add(n);
			}
		}
	}
	let out = [...pages].sort((a, b) => a - b);
	if (maxPages && maxPages > 0) out = out.filter((n) => n <= maxPages);
	return out.length ? out : undefined;
}

/**
 * Lazy-load @llamaindex/liteparse. It pulls in native modules (sharp,
 * @hyzyla/pdfium, tesseract.js); deferring keeps plugin startup cheap.
 */
async function loadLiteParse(): Promise<unknown> {
	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const mod: any = await import("@llamaindex/liteparse");
		return mod.LiteParse ?? mod.default?.LiteParse ?? mod.default ?? mod;
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(
			"Could not load @llamaindex/liteparse. Install it inside the plugin " +
			"folder (see README → Manual install). Underlying error: " + msg,
		);
	}
}

function withTimeout<T>(p: Promise<T>, seconds: number, label: string): Promise<T> {
	if (!seconds || seconds <= 0) return p;
	return new Promise<T>((resolve, reject) => {
		const t = setTimeout(() => {
			reject(new Error(`${label} timed out after ${seconds}s`));
		}, seconds * 1000);
		p.then(
			(v) => {
				clearTimeout(t);
				resolve(v);
			},
			(e) => {
				clearTimeout(t);
				reject(e);
			},
		);
	});
}

/**
 * Convert a LiteParse ParseResult into Markdown by joining pages with H2 headings.
 */
function renderMarkdownFromResult(result: {
	text?: string;
	pages?: Array<{ pageNum?: number; text?: string }>;
}): string {
	if (Array.isArray(result.pages) && result.pages.length > 0) {
		const blocks: string[] = [];
		for (const page of result.pages) {
			const num = page.pageNum ?? blocks.length + 1;
			const body = (page.text ?? "").trim();
			if (!body) continue;
			blocks.push(`### Page ${num}\n\n${body}`);
		}
		if (blocks.length > 0) return blocks.join("\n\n");
	}
	return (result.text ?? "").trim();
}

export async function parsePdf(
	absolutePath: string,
	settings: LiteParsePluginSettings,
): Promise<NormalizedParseResult> {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const LiteParseCtor: any = await loadLiteParse();
	if (typeof LiteParseCtor !== "function") {
		throw new Error("@llamaindex/liteparse: LiteParse class not found in module exports.");
	}

	const opts: ParseConstructorOptions = {
		ocrEnabled: settings.ocrEnabled,
		outputFormat: "json",
	};
	if (settings.ocrLanguage && settings.ocrLanguage.trim()) {
		opts.ocrLanguage = settings.ocrLanguage.trim();
	}
	if (settings.maxPages && settings.maxPages > 0) {
		opts.maxPages = settings.maxPages;
	}
	const targetPages = parsePageRange(settings.pageRange, settings.maxPages);
	if (targetPages) opts.targetPages = targetPages;

	if (settings.debugLogging) {
		console.debug("[liteparse-pdf-parser] parsing", absolutePath, opts);
	}

	const parser = new LiteParseCtor(opts);
	const result = await withTimeout(
		parser.parse(absolutePath, /* quiet */ !settings.debugLogging),
		settings.parseTimeoutSeconds,
		"LiteParse",
	);

	if (!result || typeof result !== "object") {
		throw new Error("LiteParse returned no result.");
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const r: any = result;
	const markdown = renderMarkdownFromResult(r);
	const text: string = typeof r.text === "string" ? r.text : markdown;
	const json: unknown | null = r.json ?? null;
	const pageCount: number | null = Array.isArray(r.pages) ? r.pages.length : null;

	return { markdown, text, json, pageCount };
}

/**
 * Best-effort sanity check at plugin load time: warn (don't fail) if the
 * native LiteParse module cannot be required. Returned promise never rejects.
 */
export async function probeLiteParseAvailable(): Promise<boolean> {
	try {
		await loadLiteParse();
		return true;
	} catch (err) {
		new Notice(
			"LiteParse PDF Parser: native dependency failed to load. " +
			"See README for desktop install steps.",
			10_000,
		);
		console.error("[liteparse-pdf-parser] LiteParse load failed:", err);
		return false;
	}
}
