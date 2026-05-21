import { LiteParsePluginSettings, OutputFormat } from "./types";
import { NormalizedParseResult } from "./parser";

const ATTRIBUTION_LINE =
	"> Parsed with [LiteParse](https://github.com/run-llama/liteparse) by Run Llama / LlamaIndex.";

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$1");
}

function formatTimestamp(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function renderBody(
	result: NormalizedParseResult,
	settings: LiteParsePluginSettings,
): string {
	const format: OutputFormat = settings.outputFormat;
	if (format === "json") {
		const json = result.json ?? { text: result.text, pages: result.pageCount };
		return "```json\n" + JSON.stringify(json, null, 2) + "\n```";
	}
	if (format === "text") {
		return "```\n" + result.text + "\n```";
	}
	// markdown (default)
	let md = result.markdown && result.markdown.trim() ? result.markdown : result.text;
	md = md.trimEnd();
	if (settings.includeLiteParseJson && result.json) {
		md += "\n\n<details><summary>LiteParse JSON</summary>\n\n```json\n";
		md += JSON.stringify(result.json, null, 2);
		md += "\n```\n\n</details>";
	}
	return md;
}

/**
 * Build the parsed-block text that gets inserted into a note.
 */
export function buildParsedBlock(
	pdfRelativePath: string,
	result: NormalizedParseResult,
	settings: LiteParsePluginSettings,
	now: Date = new Date(),
): string {
	const heading = (settings.parsedContentHeading || "Parsed PDF content").trim();
	const lines: string[] = [];
	lines.push(`<!-- liteparse:start source="${pdfRelativePath}" -->`);
	lines.push("");
	const headingSuffix = settings.replaceExistingParsedBlock
		? ""
		: ` (${formatTimestamp(now)})`;
	lines.push(`## ${heading}${headingSuffix}`);
	lines.push("");
	if (settings.includeLiteParseAttributionInNote) {
		lines.push(ATTRIBUTION_LINE);
		lines.push("");
	}
	if (settings.includeParsedTimestamp) {
		lines.push(`Parsed on: ${formatTimestamp(now)}`);
		lines.push("");
	}
	lines.push(renderBody(result, settings));
	lines.push("");
	lines.push(`<!-- liteparse:end source="${pdfRelativePath}" -->`);
	return lines.join("\n");
}

/**
 * Find an existing parsed block for the given PDF in note content.
 * Returns the [start, end] character offsets, or null.
 */
export function findExistingParsedBlock(
	noteContent: string,
	pdfRelativePath: string,
): [number, number] | null {
	const startMarker = `<!-- liteparse:start source="${pdfRelativePath}" -->`;
	const endMarker = `<!-- liteparse:end source="${pdfRelativePath}" -->`;
	const start = noteContent.indexOf(startMarker);
	if (start < 0) return null;
	const end = noteContent.indexOf(endMarker, start);
	if (end < 0) return null;
	return [start, end + endMarker.length];
}

/**
 * Find an existing parsed block matching either the exact path or its basename.
 * Useful when the PDF was moved/renamed and the old marker still references
 * an out-of-date path.
 */
export function findExistingParsedBlockByBasename(
	noteContent: string,
	pdfRelativePath: string,
): [number, number] | null {
	const exact = findExistingParsedBlock(noteContent, pdfRelativePath);
	if (exact) return exact;
	const base = pdfRelativePath.split("/").pop() ?? pdfRelativePath;
	const re = new RegExp(
		`<!--\\s*liteparse:start source="[^"]*${escapeRegex(base)}"\\s*-->`,
		"i",
	);
	const m = re.exec(noteContent);
	if (!m) return null;
	const start = m.index;
	const endRe = new RegExp(
		`<!--\\s*liteparse:end source="[^"]*${escapeRegex(base)}"\\s*-->`,
		"i",
	);
	endRe.lastIndex = start;
	const em = endRe.exec(noteContent.slice(start));
	if (!em) return null;
	return [start, start + em.index + em[0].length];
}
