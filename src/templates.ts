import { LiteParsePluginSettings, ParsingTemplate, TemplateRegion } from "./types";

export interface RawTextItem {
	text?: string;
	str?: string;
	x?: number;
	y?: number;
	width?: number;
	height?: number;
	w?: number;
	h?: number;
	fontSize?: number;
	fontName?: string;
}

export interface RawPage {
	page?: number;
	pageNum?: number;
	width?: number;
	height?: number;
	text?: string;
	textItems?: RawTextItem[];
}

export interface PageSection {
	heading: string | null;
	body: string;
}

interface ReflowLine {
	items: RawTextItem[];
	text: string;
	maxFontSize: number;
	allBold: boolean;
	allItalic: boolean;
}

interface RenderContext {
	mode: "reflow" | "raw";
	templatePages: Set<number> | null;
	baseFontSize: number;
	settings: LiteParsePluginSettings;
}

function itemX(item: RawTextItem): number {
	return Number(item.x ?? 0);
}
function itemY(item: RawTextItem): number {
	return Number(item.y ?? 0);
}
function itemWidth(item: RawTextItem): number {
	return Number(item.width ?? item.w ?? 0);
}
function itemHeight(item: RawTextItem): number {
	return Number(item.height ?? item.h ?? item.fontSize ?? 0);
}
function itemText(item: RawTextItem): string {
	return String(item.text ?? item.str ?? "");
}
function itemFontSize(item: RawTextItem): number {
	const n = Number(item.fontSize ?? itemHeight(item));
	return Number.isFinite(n) && n > 0 ? n : 0;
}
function itemFontName(item: RawTextItem): string {
	return String(item.fontName ?? "");
}

function isBoldFont(name: string): boolean {
	return /bold|black|heavy|semibold/i.test(name);
}
function isItalicFont(name: string): boolean {
	return /italic|oblique/i.test(name);
}

function parsePageRangeSpec(spec: string | undefined): Set<number> | null {
	if (!spec) return null;
	const trimmed = spec.trim();
	if (!trimmed) return null;
	const out = new Set<number>();
	for (const part of trimmed.split(",")) {
		const seg = part.trim();
		if (!seg) continue;
		const range = seg.split("-").map((s) => Number(s.trim()));
		if (range.length === 1 && Number.isFinite(range[0]) && range[0] > 0) {
			out.add(Math.floor(range[0]));
		} else if (range.length === 2 && range.every((n) => Number.isFinite(n))) {
			const lo = Math.max(1, Math.floor(Math.min(range[0], range[1])));
			const hi = Math.floor(Math.max(range[0], range[1]));
			for (let n = lo; n <= hi; n++) out.add(n);
		}
	}
	return out.size ? out : null;
}

export function selectTemplate(
	templates: ParsingTemplate[],
	pdfPath: string,
): ParsingTemplate | null {
	for (const t of templates) {
		if (!t || !t.match) continue;
		try {
			const re = new RegExp(t.match);
			if (re.test(pdfPath)) return t;
		} catch {
			// invalid regex — skip
		}
	}
	return null;
}

interface PdfRect {
	xMin: number;
	xMax: number;
	yMin: number;
	yMax: number;
	role: "include" | "exclude";
	name: string;
	headingLevel?: number;
}

/**
 * Convert a percent-based region (top-left origin, 0..100) into PDF-point
 * bounds. LiteParse uses TOP-LEFT origin in its textItems (y grows
 * downward), so no axis flip is required.
 */
function regionToPdfRect(region: TemplateRegion, pageW: number, pageH: number): PdfRect {
	const x = Math.max(0, Math.min(100, region.x));
	const y = Math.max(0, Math.min(100, region.y));
	const w = Math.max(0, Math.min(100 - x, region.w));
	const h = Math.max(0, Math.min(100 - y, region.h));
	return {
		xMin: (x / 100) * pageW,
		xMax: ((x + w) / 100) * pageW,
		yMin: (y / 100) * pageH,
		yMax: ((y + h) / 100) * pageH,
		role: region.role,
		name: region.name,
		headingLevel: region.headingLevel,
	};
}

function itemCenter(item: RawTextItem): { x: number; y: number } {
	return {
		x: itemX(item) + itemWidth(item) / 2,
		y: itemY(item) + itemHeight(item) / 2,
	};
}

function inRect(item: RawTextItem, rect: PdfRect): boolean {
	const c = itemCenter(item);
	return c.x >= rect.xMin && c.x <= rect.xMax && c.y >= rect.yMin && c.y <= rect.yMax;
}

/**
 * Group items into visual lines (top-to-bottom, then left-to-right) and
 * compute per-line markup hints.
 */
function buildLines(items: RawTextItem[]): ReflowLine[] {
	if (items.length === 0) return [];
	const sorted = [...items].sort((a, b) => {
		const yDiff = itemY(a) - itemY(b); // ascending y = top first (top-left origin)
		if (Math.abs(yDiff) > 0.5) return yDiff;
		return itemX(a) - itemX(b);
	});

	const lines: RawTextItem[][] = [];
	let currentLine: RawTextItem[] = [];
	let currentY: number | null = null;
	let lineHeight = 0;

	for (const item of sorted) {
		const y = itemY(item);
		const h = itemHeight(item) || 10;
		if (currentY === null || Math.abs(currentY - y) <= Math.max(h * 0.5, 2.5)) {
			currentLine.push(item);
			currentY = currentY === null ? y : (currentY + y) / 2;
			lineHeight = Math.max(lineHeight, h);
		} else {
			lines.push(currentLine);
			currentLine = [item];
			currentY = y;
			lineHeight = h;
		}
	}
	if (currentLine.length) lines.push(currentLine);

	const reflowLines: ReflowLine[] = [];
	for (const line of lines) {
		line.sort((a, b) => itemX(a) - itemX(b));
		const text = line.map(itemText).join(" ").replace(/\s+/g, " ").trim();
		if (!text) continue;
		const meaningful = line.filter((i) => itemText(i).trim());
		const allBold =
			meaningful.length > 0 && meaningful.every((i) => isBoldFont(itemFontName(i)));
		const allItalic =
			meaningful.length > 0 && meaningful.every((i) => isItalicFont(itemFontName(i)));
		const maxFontSize = line.reduce((m, i) => Math.max(m, itemFontSize(i)), 0);
		reflowLines.push({ items: line, text, maxFontSize, allBold, allItalic });
	}
	return reflowLines;
}

function escapeMarkdown(line: string): string {
	// Avoid accidentally enabling Markdown emphasis/headings from raw PDF
	// text. Only escape leading `#` so paragraphs don't become headings.
	return line.replace(/^#+\s/, (m) => `\\${m}`);
}

/**
 * Treat any of these as a bullet glyph at the start of a line:
 * - Known visible bullets (•, ●, ▪, ◦, etc.)
 * - The Unicode replacement character ()
 * - Anything in the Private Use Area (U+E000–U+F8FF) — fonts like
 *   Wingdings, Symbol, FontAwesome and PowerPoint's own bullet font
 *   live here; PDFs that show a list icon usually emit a PUA codepoint
 *   instead of a real bullet.
 * - A leading `*` followed by a space (some PDFs use plain asterisks).
 */
const BULLET_REGEX =
	/^[ \t]*([\u{E000}-\u{F8FF}\u{FFFD}•●◉▪▫◦‣⁃▶►◆◇∙■□❖❑❒♦♢★☆⚫⚪⬤◼◻▸▹·]|\*(?=\s))\s+/u;

/**
 * Replace a leading bullet glyph with the configured replacement.
 * Returns `null` if the bullet line is empty/whitespace-only after
 * stripping the glyph (caller should drop the line entirely).
 */
function applyBulletReplacement(text: string, replacement: string): string | null {
	if (!replacement) return text;
	const m = text.match(BULLET_REGEX);
	if (!m) return text;
	const rest = text.slice(m[0].length).trim();
	if (!rest) return null;
	return `${replacement} ${rest}`;
}

function applyLineMarkup(line: ReflowLine, ctx: RenderContext): string | null {
	const settings = ctx.settings;
	let text = line.text;

	if (settings.bulletReplacement) {
		const replaced = applyBulletReplacement(text, settings.bulletReplacement);
		if (replaced === null) return null; // drop empty bullets
		text = replaced;
	}

	// Heading detection — emit `## title` / `### title` for short, large lines.
	if (
		settings.detectHeadings &&
		ctx.baseFontSize > 0 &&
		line.maxFontSize >= ctx.baseFontSize * settings.headingFontMultiplier
	) {
		const ratio = line.maxFontSize / ctx.baseFontSize;
		const words = text.split(/\s+/).length;
		// only treat as heading if the line is short — avoids "headlining"
		// every large body line
		if (words <= 14) {
			const level = ratio >= settings.headingFontMultiplier * 1.25 ? 2 : 3;
			return `${"#".repeat(level + 1)} ${text}`;
		}
	}

	text = escapeMarkdown(text);

	if (settings.detectBoldItalic) {
		if (line.allBold && line.allItalic) text = `***${text}***`;
		else if (line.allBold) text = `**${text}**`;
		else if (line.allItalic) text = `*${text}*`;
	}

	return text;
}

function emitLines(lines: ReflowLine[], ctx: RenderContext): string {
	const out: string[] = [];
	let prevLine: ReflowLine | null = null;
	for (const line of lines) {
		const rendered = applyLineMarkup(line, ctx);
		if (rendered === null) continue; // line dropped (empty bullet)
		if (prevLine) {
			const prevY = prevLine.items.reduce((s, it) => s + itemY(it), 0) / prevLine.items.length;
			const curY = line.items.reduce((s, it) => s + itemY(it), 0) / line.items.length;
			const gap = curY - prevY;
			const prevH = prevLine.items.reduce((m, it) => Math.max(m, itemHeight(it)), 0) || 10;
			if (gap > Math.max(prevH * 1.6, 14)) out.push("");
		}
		out.push(rendered);
		prevLine = line;
	}
	return out.join("\n");
}

function applyTemplateToPage(
	template: ParsingTemplate,
	page: RawPage,
	ctx: RenderContext,
): PageSection[] {
	const items = page.textItems ?? [];
	const pageW = Number(page.width ?? 612);
	const pageH = Number(page.height ?? 792);
	const rects = template.regions
		.filter((r) => r && typeof r === "object")
		.map((r) => regionToPdfRect(r, pageW, pageH));

	const excludeRects = rects.filter((r) => r.role === "exclude");
	const includeRects = rects.filter((r) => r.role === "include");

	const survivors = items.filter((it) => !excludeRects.some((r) => inRect(it, r)));

	if (includeRects.length === 0) {
		const lines = buildLines(survivors);
		const body = emitLines(lines, ctx);
		return body ? [{ heading: null, body }] : [];
	}

	const sections: PageSection[] = [];
	for (const rect of includeRects) {
		const inside = survivors.filter((it) => inRect(it, rect));
		const lines = buildLines(inside);
		const body = emitLines(lines, ctx);
		if (!body) continue;
		const heading =
			rect.headingLevel && rect.headingLevel >= 1 && rect.headingLevel <= 6
				? `${"#".repeat(rect.headingLevel)} ${rect.name}`
				: null;
		sections.push({ heading, body });
	}
	return sections;
}

export function renderPage(
	page: RawPage,
	template: ParsingTemplate | null,
	settings: LiteParsePluginSettings,
	baseFontSize: number,
	templatePages: Set<number> | null,
): PageSection[] {
	const ctx: RenderContext = {
		mode: settings.extractionMode,
		templatePages,
		baseFontSize,
		settings,
	};
	const num = Number(page.page ?? page.pageNum ?? 0);
	if (template && (!templatePages || templatePages.has(num))) {
		return applyTemplateToPage(template, page, ctx);
	}
	if (settings.extractionMode === "raw") {
		const body = String(page.text ?? "").replace(/\s+$/g, "");
		return body ? [{ heading: null, body }] : [];
	}
	const lines = buildLines(page.textItems ?? []);
	const body = emitLines(lines, ctx);
	return body ? [{ heading: null, body }] : [];
}

export function pageNumberOf(page: RawPage, fallback: number): number {
	const n = Number(page.page ?? page.pageNum ?? fallback);
	return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function templatePageFilter(template: ParsingTemplate | null): Set<number> | null {
	if (!template) return null;
	return parsePageRangeSpec(template.pages);
}

/**
 * Compute a robust base font size for the document — the median of all
 * textItem font sizes. Used as the threshold reference for heading
 * detection.
 */
export function computeBaseFontSize(pages: RawPage[]): number {
	const sizes: number[] = [];
	for (const p of pages) {
		for (const it of p.textItems ?? []) {
			const s = itemFontSize(it);
			if (s > 0) sizes.push(s);
		}
	}
	if (sizes.length === 0) return 12;
	sizes.sort((a, b) => a - b);
	return sizes[Math.floor(sizes.length / 2)];
}
