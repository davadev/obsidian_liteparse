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
	pageBaseFontSize: number;
	settings: LiteParsePluginSettings;
}

/** Resolve which font-size median heading detection should compare against. */
function resolveBaseFontSize(ctx: RenderContext): number {
	if (ctx.settings.headingFontReference === "document") return ctx.baseFontSize;
	return ctx.pageBaseFontSize > 0 ? ctx.pageBaseFontSize : ctx.baseFontSize;
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

/**
 * Pick a template by path-regex match. Among all templates whose regex
 * matches the PDF path, prefer the one with the longest pattern source
 * (= most specific). On ties, the earlier template in the list wins.
 *
 * Rationale: users typically add a broad fallback template first (e.g.
 * `.*\.pdf$`) and then add narrower per-file templates (e.g.
 * `_resources/1b - AI-1 Organisation\.pdf$`). First-match-wins meant
 * the broad one always took over. Longest-pattern-wins matches user
 * intuition: the more specific template wins, regardless of order.
 */
export function selectTemplate(
	templates: ParsingTemplate[],
	pdfPath: string,
): ParsingTemplate | null {
	let best: ParsingTemplate | null = null;
	let bestSpecificity = -1;
	for (const t of templates) {
		if (!t || !t.match) continue;
		try {
			const re = new RegExp(t.match);
			if (!re.test(pdfPath)) continue;
		} catch {
			continue;
		}
		const specificity = t.match.length;
		if (specificity > bestSpecificity) {
			best = t;
			bestSpecificity = specificity;
		}
	}
	return best;
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
	const base = resolveBaseFontSize(ctx);
	if (
		settings.detectHeadings &&
		base > 0 &&
		line.maxFontSize >= base * settings.headingFontMultiplier
	) {
		const ratio = line.maxFontSize / base;
		const words = text.split(/\s+/).length;
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
			// 2.0 (vs the old 1.6) avoids inserting a blank line between
			// table rows where the y-spacing tends to be ~1.8× the cell
			// font height. Real paragraph breaks in body prose typically
			// have gap ≥ 2× line-height, so 2.0 still catches them.
			if (gap > Math.max(prevH * 2.0, 14)) out.push("");
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
			(tryColumns && splitIntoColumns(survivors, 0, pageW, ctx.settings, resolveBaseFontSize(ctx))) ||
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
				splitIntoColumns(inside, rect.xMin, rect.xMax, ctx.settings, resolveBaseFontSize(ctx))) ||
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
		pageBaseFontSize: computePageBaseFontSize(page),
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
			splitIntoColumns(pageItems, 0, pageW, settings, resolveBaseFontSize(ctx))) ||
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
		const matched = re.test(sample);
		if (debug) {
			const pageNum = Number(page.page ?? page.pageNum ?? 0);
			console.debug(
				`[liteparse-pdf-parser] probe ${template.name}/${probe.name} on page ${pageNum}: ` +
				`text=${JSON.stringify(sample.slice(0, 80))} pattern=/${probe.pattern}/${probe.flags ?? ""} ` +
				`=> ${matched ? "MATCH" : "no match"}`,
			);
		}
		if (matched) return probe.onMatch;
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
/**
 * Detect a two-column layout via whitespace projection.
 *
 * Algorithm:
 *  1. Rasterize items onto a 100×50 grid covering the scope (x × y).
 *     Each cell is "filled" if at least one item overlaps it.
 *  2. For each x bucket, compute coverage = (filled y-cells) / 50.
 *     A real column's coverage is 0.6–0.9; a gutter that only sees
 *     occasional titles crossing is ~0.05–0.10. Threshold at 0.20.
 *  3. Find the longest contiguous run of low-coverage buckets in the
 *     middle 20–80% of the scope. That's the column gutter.
 *  4. Items entirely left of the gutter → left column.
 *     Items entirely right of the gutter → right column.
 *     Items straddling → full-width (titles, subheadings) — emit first.
 *
 * The 2D rasterization (vs the v0.7.0 sum-of-heights metric) makes
 * coverage robust against sparse columns: 4 bullet lines spread across
 * the column's height still register as ~30% coverage even though
 * their accumulated height is only ~5% of scope. v0.7.0 misclassified
 * sparse columns as gutter, scrambling reading order.
 */
function splitIntoColumns(
	items: RawTextItem[],
	scopeXMin: number,
	scopeXMax: number,
	settings: LiteParsePluginSettings,
	baseFontSize: number,
): ReflowLine[] | null {
	if (items.length < 6) return null;
	const scopeWidth = Math.max(1, scopeXMax - scopeXMin);

	let yLo = Infinity;
	let yHi = -Infinity;
	for (const it of items) {
		const y = itemY(it);
		const h = itemHeight(it);
		if (y < yLo) yLo = y;
		if (y + h > yHi) yHi = y + h;
	}
	if (!Number.isFinite(yLo) || !Number.isFinite(yHi)) return null;
	const scopeHeight = Math.max(1, yHi - yLo);

	const X_STEPS = 100;
	const Y_STEPS = 50;
	const xBucketW = scopeWidth / X_STEPS;
	const yBucketH = scopeHeight / Y_STEPS;
	const grid = new Uint8Array(X_STEPS * Y_STEPS);

	for (const it of items) {
		const ix = itemX(it);
		const iw = itemWidth(it);
		const iy = itemY(it);
		const ih = itemHeight(it);
		if (ih === 0) continue;
		const bxs = Math.max(0, Math.min(X_STEPS - 1, Math.floor((ix - scopeXMin) / xBucketW)));
		const bxe = Math.max(0, Math.min(X_STEPS - 1, Math.floor((ix + iw - scopeXMin) / xBucketW)));
		const bys = Math.max(0, Math.min(Y_STEPS - 1, Math.floor((iy - yLo) / yBucketH)));
		const bye = Math.max(0, Math.min(Y_STEPS - 1, Math.floor((iy + ih - yLo) / yBucketH)));
		for (let bx = bxs; bx <= bxe; bx++) {
			for (let by = bys; by <= bye; by++) {
				grid[by * X_STEPS + bx] = 1;
			}
		}
	}

	const coverage = new Array<number>(X_STEPS);
	for (let bx = 0; bx < X_STEPS; bx++) {
		let count = 0;
		for (let by = 0; by < Y_STEPS; by++) {
			if (grid[by * X_STEPS + bx]) count++;
		}
		coverage[bx] = count / Y_STEPS;
	}

	const EMPTY_COVERAGE = 0.2;
	const minBx = Math.floor(X_STEPS * 0.2);
	const maxBx = Math.floor(X_STEPS * 0.8);

	let bestStart = -1;
	let bestLen = 0;
	let curStart = -1;
	for (let bx = minBx; bx <= maxBx; bx++) {
		if (coverage[bx] < EMPTY_COVERAGE) {
			if (curStart < 0) curStart = bx;
		} else {
			if (curStart >= 0) {
				const len = bx - curStart;
				if (len > bestLen) {
					bestLen = len;
					bestStart = curStart;
				}
				curStart = -1;
			}
		}
	}
	if (curStart >= 0) {
		const len = maxBx + 1 - curStart;
		if (len > bestLen) {
			bestLen = len;
			bestStart = curStart;
		}
	}

	if (bestLen === 0) return null;

	const gutterWidth = bestLen * xBucketW;
	const minGutterPct = Math.max(0.5, Math.min(20, settings.columnGutterMinPct));
	if (gutterWidth < scopeWidth * (minGutterPct / 100)) return null;

	const gutterLo = scopeXMin + bestStart * xBucketW;
	const gutterHi = scopeXMin + (bestStart + bestLen) * xBucketW;

	const headingMult = Math.max(1, settings.headingFontMultiplier);
	const headingThreshold = baseFontSize > 0 ? baseFontSize * headingMult : Infinity;

	const leftItems: RawTextItem[] = [];
	const rightItems: RawTextItem[] = [];
	const fullItems: RawTextItem[] = [];
	for (const it of items) {
		// Heading-sized items (slide titles, full-width subheadings) always
		// emit above the columns regardless of x-position.
		const itemSize = itemFontSize(it) || itemHeight(it);
		if (itemSize >= headingThreshold) {
			fullItems.push(it);
			continue;
		}
		// Classify by item CENTER vs gutter. An item whose center sits on
		// the left side of the gutter belongs to the left column even if
		// its right edge extends slightly past gutterLo (common for body
		// paragraph items that taper into the column gutter). Items whose
		// center is inside the gutter band are treated as full-width
		// content (titles, separator dots, etc.).
		const ix1 = itemX(it);
		const cx = ix1 + itemWidth(it) / 2;
		if (cx < gutterLo) leftItems.push(it);
		else if (cx > gutterHi) rightItems.push(it);
		else fullItems.push(it);
	}
	if (leftItems.length === 0 || rightItems.length === 0) return null;

	// Both columns need enough content to actually be columns — otherwise
	// what we detected was probably a real white margin, not a gutter.
	if (leftItems.length < 3 || rightItems.length < 3) return null;

	const fullLines = buildLines(fullItems);
	const leftLines = buildLines(leftItems);
	const rightLines = buildLines(rightItems);

	return [...fullLines, ...leftLines, ...rightLines];
}

/**
 * Median font size of a single page's text items. Used when
 * `headingFontReference === "page"`. Robust against outlier slides
 * where the body font is much larger than the document average.
 */
function computePageBaseFontSize(page: RawPage): number {
	const sizes: number[] = [];
	for (const it of page.textItems ?? []) {
		const s = itemFontSize(it);
		if (s > 0) sizes.push(s);
	}
	if (sizes.length === 0) return 0;
	sizes.sort((a, b) => a - b);
	return sizes[Math.floor(sizes.length / 2)];
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
