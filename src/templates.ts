import { ParsingTemplate, TemplateRegion } from "./types";

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

export interface RenderedPage {
	pageNumber: number;
	sections: PageSection[];
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
 * Find a template whose `match` regex matches the PDF's vault-relative
 * path. Returns null if none match.
 */
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

/**
 * Convert a percent-based region (top-left origin, 0..100) into PDF-point
 * bounds (bottom-left origin) for a page with the given dimensions.
 */
interface PdfRect {
	xMin: number;
	xMax: number;
	yMin: number;
	yMax: number;
	role: "include" | "exclude";
	name: string;
	headingLevel?: number;
}

function regionToPdfRect(region: TemplateRegion, pageW: number, pageH: number): PdfRect {
	const x = Math.max(0, Math.min(100, region.x));
	const y = Math.max(0, Math.min(100, region.y));
	const w = Math.max(0, Math.min(100 - x, region.w));
	const h = Math.max(0, Math.min(100 - y, region.h));
	const xMin = (x / 100) * pageW;
	const xMax = ((x + w) / 100) * pageW;
	// flip y: top-left input → bottom-left PDF
	const yMax = pageH - (y / 100) * pageH;
	const yMin = pageH - ((y + h) / 100) * pageH;
	return {
		xMin,
		xMax,
		yMin,
		yMax,
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
 * Reconstruct flowing text from a set of textItems by grouping items into
 * visual lines (by y proximity) and joining them with single spaces.
 */
function reflowItems(items: RawTextItem[]): string {
	if (items.length === 0) return "";
	const sorted = [...items].sort((a, b) => {
		const yDiff = itemY(b) - itemY(a); // top first (higher y first in PDF coords)
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
		if (currentY === null || Math.abs(currentY - y) <= Math.max(h * 0.6, 3)) {
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

	const out: string[] = [];
	let prevY: number | null = null;
	let prevH = 0;
	for (const line of lines) {
		line.sort((a, b) => itemX(a) - itemX(b));
		const text = line.map(itemText).join(" ").replace(/\s+/g, " ").trim();
		if (!text) continue;
		const y = line.reduce((s, it) => s + itemY(it), 0) / line.length;
		const h = Math.max(...line.map(itemHeight), 10);
		if (prevY !== null) {
			const gap = prevY - y;
			if (gap > Math.max(prevH * 1.5, 12)) {
				out.push("");
			}
		}
		out.push(text);
		prevY = y;
		prevH = h;
	}
	return out.join("\n");
}

/**
 * Apply a template's regions to a single page's textItems, returning the
 * ordered sections of text per include region.
 */
function applyTemplateToPage(
	template: ParsingTemplate,
	page: RawPage,
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
		const body = reflowItems(survivors);
		return body ? [{ heading: null, body }] : [];
	}

	const sections: PageSection[] = [];
	for (const rect of includeRects) {
		const inside = survivors.filter((it) => inRect(it, rect));
		const body = reflowItems(inside);
		if (!body) continue;
		const heading =
			rect.headingLevel && rect.headingLevel >= 1 && rect.headingLevel <= 6
				? `${"#".repeat(rect.headingLevel)} ${rect.name}`
				: null;
		sections.push({ heading, body });
	}
	return sections;
}

/**
 * Build the rendered sections for a page using either a matched template
 * or the default reflow (no regions, all items).
 */
export function renderPage(
	page: RawPage,
	template: ParsingTemplate | null,
	mode: "reflow" | "raw",
	templatePages: Set<number> | null,
): PageSection[] {
	const num = Number(page.page ?? page.pageNum ?? 0);
	if (template && (!templatePages || templatePages.has(num))) {
		return applyTemplateToPage(template, page);
	}
	if (mode === "raw") {
		const body = String(page.text ?? "").replace(/\s+$/g, "");
		return body ? [{ heading: null, body }] : [];
	}
	const body = reflowItems(page.textItems ?? []);
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
