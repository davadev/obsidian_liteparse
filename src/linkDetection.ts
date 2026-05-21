import { App, TFile } from "obsidian";
import { PdfLinkMatch } from "./types";

const WIKILINK_REGEX = /(!?)\[\[([^\[\]\n]+?)\]\]/g;
const MD_LINK_REGEX = /!?\[([^\]\n]*)\]\(([^)\n]+?)\)/g;

function stripAlias(target: string): string {
	const hashIdx = target.indexOf("#");
	const pipeIdx = target.indexOf("|");
	let end = target.length;
	if (hashIdx >= 0) end = Math.min(end, hashIdx);
	if (pipeIdx >= 0) end = Math.min(end, pipeIdx);
	return target.slice(0, end).trim();
}

function tryDecode(s: string): string {
	try {
		return decodeURIComponent(s);
	} catch {
		return s;
	}
}

function endsWithPdf(s: string): boolean {
	return /\.pdf$/i.test(s.trim());
}

function offsetToLine(text: string, offset: number): number {
	let line = 0;
	for (let i = 0; i < offset && i < text.length; i++) {
		if (text.charCodeAt(i) === 10) line++;
	}
	return line;
}

/**
 * Find every PDF link/embed in the given note content.
 *
 * Supports:
 *  - ![[file.pdf]] and ![[folder/file.pdf]] and ![[file.pdf|alias]]
 *  - [[file.pdf]] / [[folder/file.pdf]]
 *  - [label](file.pdf) / [label](folder/file.pdf) (URL-encoded spaces decoded)
 */
export function findPdfLinks(
	app: App,
	noteContent: string,
	notePath: string,
): PdfLinkMatch[] {
	const matches: PdfLinkMatch[] = [];

	WIKILINK_REGEX.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = WIKILINK_REGEX.exec(noteContent))) {
		const inner = m[2];
		const target = stripAlias(inner);
		if (!endsWithPdf(target)) continue;
		const resolved = app.metadataCache.getFirstLinkpathDest(target, notePath);
		matches.push({
			rawText: m[0],
			startOffset: m.index,
			endOffset: m.index + m[0].length,
			resolvedPath: resolved?.path ?? null,
			rawTarget: target,
			lineNumber: offsetToLine(noteContent, m.index),
		});
	}

	MD_LINK_REGEX.lastIndex = 0;
	while ((m = MD_LINK_REGEX.exec(noteContent))) {
		const url = m[2].trim();
		// strip optional "title" portion: [label](path "title")
		const spaceIdx = url.indexOf(" ");
		const cleanUrl = spaceIdx > 0 ? url.slice(0, spaceIdx) : url;
		const decoded = tryDecode(cleanUrl);
		if (!endsWithPdf(decoded)) continue;
		// skip external URLs — only vault-relative PDFs
		if (/^[a-z][a-z0-9+.-]*:/i.test(decoded)) continue;
		const resolved = app.metadataCache.getFirstLinkpathDest(decoded, notePath);
		matches.push({
			rawText: m[0],
			startOffset: m.index,
			endOffset: m.index + m[0].length,
			resolvedPath: resolved?.path ?? null,
			rawTarget: decoded,
			lineNumber: offsetToLine(noteContent, m.index),
		});
	}

	matches.sort((a, b) => a.startOffset - b.startOffset);
	return matches;
}

/**
 * Find Markdown notes in the vault that link or embed the given PDF.
 * Uses Obsidian's resolvedLinks index for accuracy.
 */
export function findNotesLinkingPdf(app: App, pdf: TFile): TFile[] {
	const result: TFile[] = [];
	const resolved = app.metadataCache.resolvedLinks;
	for (const sourcePath in resolved) {
		const links = resolved[sourcePath];
		if (links && pdf.path in links) {
			const f = app.vault.getAbstractFileByPath(sourcePath);
			if (f instanceof TFile && f.extension === "md") {
				result.push(f);
			}
		}
	}
	return result;
}

/**
 * Filter link matches whose resolved path equals the given PDF path.
 */
export function matchesForPdf(
	links: PdfLinkMatch[],
	pdfPath: string,
): PdfLinkMatch[] {
	return links.filter((l) => l.resolvedPath === pdfPath);
}
