import {
	LiteParsePluginSettings,
	ParsingTemplate,
	ProbeAction,
	TemplateProbe,
	TemplateRegion,
} from "./types";

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
function percentRectToPdfBounds(
	region: { x: number; y: number; w: number; h: number },
	pageW: number,
	pageH: number,
): { xMin: number; xMax: number; yMin: number; yMax: number } {
	const x = Math.max(0, Math.min(100, region.x));
	const y = Math.max(0, Math.min(100, region.y));
	const w = Math.max(0, Math.min(100 - x, region.w));
	const h = Math.max(0, Math.min(100 - y, region.h));
	return {
		xMin: (x / 100) * pageW,
		xMax: ((x + w) / 100) * pageW,
		yMin: (y / 100) * pageH,
		yMax: ((y + h) / 100) * pageH,
	};
}

function regionToPdfRect(region: TemplateRegion, pageW: number, pageH: number): PdfRect {
	const b = percentRectToPdfBounds(region, pageW, pageH);
	return {
		...b,
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

	// Column auto-detect runs only when the user hasn't already split the
	// page into multiple include regions — multiple includes are taken as
	// a manual override that should win.
	const tryColumns = ctx.settings.autoDetectColumns && includeRects.length <= 1;

	if (includeRects.length === 0) {
		const lines =
			(tryColumns && splitIntoColumns(survivors, 0, pageW, ctx.settings)) ||
			buildLines(survivors);
		const body = emitLines(lines, ctx);
		return body ? [{ heading: null, body }] : [];
	}

	const sections: PageSection[] = [];
	for (const rect of includeRects) {
		const inside = survivors.filter((it) => inRect(it, rect));
		const rectWidthFrac = (rect.xMax - rect.xMin) / Math.max(1, pageW);
		const eligibleForColumns = tryColumns && rectWidthFrac >= 0.6;
		const lines =
			(eligibleForColumns &&
				splitIntoColumns(inside, rect.xMin, rect.xMax, ctx.settings)) ||
			buildLines(inside);
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
	const pageItems = page.textItems ?? [];
	const pageW = Number(page.width ?? 612);
	const lines =
		(settings.autoDetectColumns &&
			splitIntoColumns(pageItems, 0, pageW, settings)) ||
		buildLines(pageItems);
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

// ── Probes (pre-classification) ──────────────────────────────────────────

/**
 * Read the text inside a probe rectangle in natural reading order.
 * Returns "" if no items fall inside.
 */
function extractProbeText(probe: TemplateProbe, page: RawPage): string {
	const items = page.textItems ?? [];
	if (items.length === 0) return "";
	const pageW = Number(page.width ?? 612);
	const pageH = Number(page.height ?? 792);
	const b = percentRectToPdfBounds(probe, pageW, pageH);
	const inside = items.filter((it) => {
		const c = itemCenter(it);
		return c.x >= b.xMin && c.x <= b.xMax && c.y >= b.yMin && c.y <= b.yMax;
	});
	if (inside.length === 0) return "";
	inside.sort((a, b) => {
		const dy = itemY(a) - itemY(b);
		if (Math.abs(dy) > 0.5) return dy;
		return itemX(a) - itemX(b);
	});
	return inside.map(itemText).join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Evaluate a template's probes against a page. Returns the first matching
 * probe's action, or null when no probe matches (or the template has none).
 */
function evaluateProbes(
	template: ParsingTemplate,
	page: RawPage,
	debug: boolean,
	invalid?: Set<string>,
): ProbeAction | null {
	const probes = template.probes;
	if (!probes || probes.length === 0) return null;
	const text = (() => {
		const cache = new Map<TemplateProbe, string>();
		return (probe: TemplateProbe) => {
			const cached = cache.get(probe);
			if (cached !== undefined) return cached;
			const t = extractProbeText(probe, page);
			cache.set(probe, t);
			return t;
		};
	})();
	for (const probe of probes) {
		if (!probe || !probe.pattern) continue;
		let re: RegExp;
		try {
			re = new RegExp(probe.pattern, probe.flags ?? "");
		} catch (err) {
			if (debug) console.debug("[liteparse-pdf-parser] probe regex invalid", probe.name, err);
			if (invalid)
				invalid.add(`${template.name}/${probe.name}: ${err instanceof Error ? err.message : String(err)}`);
			continue;
		}
		const sample = text(probe);
		if (re.test(sample)) {
			if (debug) {
				console.debug(
					"[liteparse-pdf-parser] probe match",
					template.name,
					probe.name,
					"=>",
					probe.onMatch,
				);
			}
			return probe.onMatch;
		}
	}
	return null;
}

export interface ResolvedTemplate {
	/** Effective template to apply, or null when the page should be skipped. */
	template: ParsingTemplate | null;
	/** True when probes resolved to a "skip page" action. */
	skip: boolean;
}

/**
 * Walk a probe-driven template chain for one page. Cycle-guarded; if a
 * `switch` action points to a missing template or a cycle is detected,
 * falls back to the last valid template.
 */
export function resolveEffectiveTemplate(
	initial: ParsingTemplate | null,
	page: RawPage,
	allTemplates: ParsingTemplate[],
	debug: boolean,
	invalidProbes?: Set<string>,
): ResolvedTemplate {
	if (!initial) return { template: null, skip: false };
	const visited = new Set<string>();
	let current: ParsingTemplate = initial;
	for (let depth = 0; depth < 4; depth++) {
		if (visited.has(current.name)) {
			if (debug)
				console.debug("[liteparse-pdf-parser] probe switch cycle, bailing on", current.name);
			return { template: current, skip: false };
		}
		visited.add(current.name);
		const action = evaluateProbes(current, page, debug, invalidProbes);
		if (!action) return { template: current, skip: false };
		if (action.kind === "use-current") return { template: current, skip: false };
		if (action.kind === "skip") return { template: null, skip: true };
		if (action.kind === "switch") {
			const next = allTemplates.find((t) => t && t.name === action.templateName);
			if (!next) {
				if (debug)
					console.debug(
						"[liteparse-pdf-parser] probe switch target missing",
						action.templateName,
					);
				return { template: current, skip: false };
			}
			current = next;
			continue;
		}
	}
	if (debug) console.debug("[liteparse-pdf-parser] probe switch depth exceeded");
	return { template: current, skip: false };
}

// ── Column auto-detect ───────────────────────────────────────────────────

/**
 * Try to recognize a two-column layout inside a scope of items and return
 * lines in column reading order (full-width lines first, then column A, then
 * column B). Returns null when the scope doesn't look like two columns; the
 * caller should fall back to plain `buildLines`.
 *
 * Conservative gates (see plan):
 *   - ≥ 6 items in scope
 *   - ≥ 4 distinct y-bands
 *   - a clean vertical gutter ≥ gutterMinPct wide in the middle 30–70% of
 *     scope width that no item crosses, spanning ≥ 50% of the column items'
 *     vertical extent
 *   - full-width lines (x-span > fullWidthPct of scope) are emitted at top
 *     to preserve titles
 */
function splitIntoColumns(
	items: RawTextItem[],
	scopeXMin: number,
	scopeXMax: number,
	settings: LiteParsePluginSettings,
): ReflowLine[] | null {
	if (items.length < 6) return null;
	const scopeWidth = Math.max(1, scopeXMax - scopeXMin);
	const fullWidthFrac = Math.max(0, Math.min(1, settings.columnFullWidthThresholdPct / 100));
	const gutterFrac = Math.max(0.005, Math.min(0.5, settings.columnGutterMinPct / 100));

	// Build candidate lines first so we can detect full-width lines.
	const lines = buildLines(items);
	if (lines.length < 4) return null;

	const lineXSpan = (line: ReflowLine): { lo: number; hi: number } => {
		let lo = Infinity;
		let hi = -Infinity;
		for (const it of line.items) {
			const x = itemX(it);
			const w = itemWidth(it);
			if (x < lo) lo = x;
			if (x + w > hi) hi = x + w;
		}
		return { lo, hi };
	};

	const fullWidthLines: ReflowLine[] = [];
	const columnLines: ReflowLine[] = [];
	for (const line of lines) {
		const { lo, hi } = lineXSpan(line);
		const span = hi - lo;
		if (span / scopeWidth > fullWidthFrac) fullWidthLines.push(line);
		else columnLines.push(line);
	}
	if (columnLines.length < 4) return null;

	const columnItems: RawTextItem[] = [];
	for (const line of columnLines) for (const it of line.items) columnItems.push(it);

	let yLo = Infinity;
	let yHi = -Infinity;
	for (const it of columnItems) {
		const y = itemY(it);
		const h = itemHeight(it);
		if (y < yLo) yLo = y;
		if (y + h > yHi) yHi = y + h;
	}
	const verticalExtent = Math.max(1, yHi - yLo);

	let bestGutterCenter = -1;
	let bestGutterWidth = 0;
	for (let pct = 30; pct <= 70; pct++) {
		const centerX = scopeXMin + (pct / 100) * scopeWidth;
		const halfBand = (gutterFrac * scopeWidth) / 2;
		const bandLo = centerX - halfBand;
		const bandHi = centerX + halfBand;
		let crosses = false;
		for (const it of columnItems) {
			const ix = itemX(it);
			const iw = itemWidth(it);
			if (ix + iw > bandLo && ix < bandHi) {
				crosses = true;
				break;
			}
		}
		if (crosses) continue;
		// vertical coverage: how much of the columnItems' vertical extent is
		// flanked by items on both sides of the gutter?
		let leftYLo = Infinity;
		let leftYHi = -Infinity;
		let rightYLo = Infinity;
		let rightYHi = -Infinity;
		for (const it of columnItems) {
			const cx = itemX(it) + itemWidth(it) / 2;
			const y = itemY(it);
			const yh = y + itemHeight(it);
			if (cx < centerX) {
				if (y < leftYLo) leftYLo = y;
				if (yh > leftYHi) leftYHi = yh;
			} else {
				if (y < rightYLo) rightYLo = y;
				if (yh > rightYHi) rightYHi = yh;
			}
		}
		if (!Number.isFinite(leftYLo) || !Number.isFinite(rightYLo)) continue;
		const overlap =
			Math.max(0, Math.min(leftYHi, rightYHi) - Math.max(leftYLo, rightYLo)) /
			verticalExtent;
		if (overlap < 0.5) continue;
		if (gutterFrac * scopeWidth > bestGutterWidth) {
			bestGutterWidth = gutterFrac * scopeWidth;
			bestGutterCenter = centerX;
		}
	}
	if (bestGutterCenter < 0) return null;

	const leftItems: RawTextItem[] = [];
	const rightItems: RawTextItem[] = [];
	for (const it of columnItems) {
		const cx = itemX(it) + itemWidth(it) / 2;
		if (cx < bestGutterCenter) leftItems.push(it);
		else rightItems.push(it);
	}
	if (leftItems.length === 0 || rightItems.length === 0) return null;

	const leftLines = buildLines(leftItems);
	const rightLines = buildLines(rightItems);
	if (leftLines.length === 0 || rightLines.length === 0) return null;

	return [...fullWidthLines, ...leftLines, ...rightLines];
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
