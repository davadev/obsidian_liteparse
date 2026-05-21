import { App, TFile, normalizePath } from "obsidian";
import { LiteParsePluginSettings, PdfLinkMatch } from "./types";
import { NormalizedParseResult } from "./parser";
import {
	buildParsedBlock,
	findExistingParsedBlock,
	findExistingParsedBlockByBasename,
} from "./output";

/**
 * Find the end-of-paragraph offset starting at `from`. A paragraph ends at
 * either end-of-file or a blank line (two consecutive newlines).
 */
function paragraphEnd(content: string, from: number): number {
	const blank = content.indexOf("\n\n", from);
	if (blank < 0) return content.length;
	return blank;
}

/**
 * Insert (or replace) a parsed block in the given note, attached to the
 * specified PDF link match. Returns the new note content.
 */
export function insertParsedBlockIntoNote(
	noteContent: string,
	match: PdfLinkMatch,
	pdfRelativePath: string,
	result: NormalizedParseResult,
	settings: LiteParsePluginSettings,
	now: Date = new Date(),
): string {
	const block = buildParsedBlock(pdfRelativePath, result, settings, now);

	if (settings.replaceExistingParsedBlock) {
		const existing =
			findExistingParsedBlock(noteContent, pdfRelativePath) ??
			findExistingParsedBlockByBasename(noteContent, pdfRelativePath);
		if (existing) {
			const [s, e] = existing;
			return noteContent.slice(0, s) + block + noteContent.slice(e);
		}
	}

	const insertAt = paragraphEnd(noteContent, match.endOffset);
	const before = noteContent.slice(0, insertAt);
	const after = noteContent.slice(insertAt);
	const sep = before.endsWith("\n") ? "\n" : "\n\n";
	const trailing = after.startsWith("\n") ? "\n" : "\n\n";
	return before + sep + block + trailing + after.replace(/^\n+/, "");
}

/**
 * Apply parsed output to the given note via the Obsidian Vault API.
 */
export async function applyParsedBlockToNote(
	app: App,
	note: TFile,
	match: PdfLinkMatch,
	pdfRelativePath: string,
	result: NormalizedParseResult,
	settings: LiteParsePluginSettings,
): Promise<void> {
	await app.vault.process(note, (content) =>
		insertParsedBlockIntoNote(content, match, pdfRelativePath, result, settings),
	);
}

/**
 * Build the path for a fallback parsed-note when no linking note is found.
 */
export function fallbackNotePath(
	pdf: TFile,
	settings: LiteParsePluginSettings,
): string {
	const base = pdf.basename + ".parsed.md";
	if (settings.outputFolderModeForFallbackNote === "custom-folder") {
		const folder = settings.customOutputFolderForFallbackNote.trim();
		if (folder) return normalizePath(`${folder}/${base}`);
	}
	const parent = pdf.parent?.path ?? "";
	return normalizePath(parent ? `${parent}/${base}` : base);
}

/**
 * Create or overwrite a separate parsed-note next to the PDF.
 */
export async function writeFallbackParsedNote(
	app: App,
	pdf: TFile,
	result: NormalizedParseResult,
	settings: LiteParsePluginSettings,
): Promise<TFile> {
	const targetPath = fallbackNotePath(pdf, settings);
	const block = buildParsedBlock(pdf.path, result, settings);
	const linkLine = `![[${pdf.path}]]`;
	const body = `${linkLine}\n\n${block}\n`;
	const existing = app.vault.getAbstractFileByPath(targetPath);
	if (existing instanceof TFile) {
		await app.vault.modify(existing, body);
		return existing;
	}
	const parent = targetPath.includes("/")
		? targetPath.slice(0, targetPath.lastIndexOf("/"))
		: "";
	if (parent && !app.vault.getAbstractFileByPath(parent)) {
		await app.vault.createFolder(parent).catch(() => undefined);
	}
	return await app.vault.create(targetPath, body);
}
