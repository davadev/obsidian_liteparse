export type OutputFormat = "markdown" | "text" | "json";

export type FallbackFolderMode = "same-folder" | "custom-folder";

export type ExtractionMode = "reflow" | "raw";

/**
 * A user-defined region on a PDF page, expressed as a percentage of page
 * dimensions, with the top-left corner as origin (so x=0,y=0 is top-left,
 * x=100,y=100 is bottom-right). Internally converted to PDF points
 * (bottom-left origin) when matching textItems.
 */
export interface TemplateRegion {
	name: string;
	role: "include" | "exclude";
	x: number;
	y: number;
	w: number;
	h: number;
	/** Optional Markdown heading level (1-6). If set, prefixes the region
	 *  output with `## name` (or whatever level). Omit for no heading. */
	headingLevel?: number;
}

export interface ParsingTemplate {
	name: string;
	/** Regex matched against the PDF's vault-relative path. Use ".*" for default. */
	match: string;
	/** Optional page range (e.g. "1-5,10"). Empty means all pages. */
	pages?: string;
	regions: TemplateRegion[];
}

export interface LiteParsePluginSettings {
	replaceExistingParsedBlock: boolean;
	createSeparateParsedNoteWhenNoLinkedNoteFound: boolean;
	outputFolderModeForFallbackNote: FallbackFolderMode;
	customOutputFolderForFallbackNote: string;
	openOutputAfterParsing: boolean;
	includeLiteParseAttributionInNote: boolean;
	includeParsedTimestamp: boolean;
	parsedContentHeading: string;
	outputFormat: OutputFormat;
	includeLiteParseJson: boolean;
	jsonSidecar: boolean;
	ocrEnabled: boolean;
	ocrLanguage: string;
	maxPages: number | null;
	pageRange: string;
	parseTimeoutSeconds: number;
	debugLogging: boolean;

	// readability
	extractionMode: ExtractionMode;
	includePageHeadings: boolean;
	pageDivider: string;
	collapseBlankLines: boolean;

	// markup detection (from LiteParse textItem fontName/fontSize)
	bulletReplacement: string;
	detectBoldItalic: boolean;
	detectHeadings: boolean;
	headingFontMultiplier: number;
	promoteTitleSlides: boolean;

	// templates
	templates: ParsingTemplate[];
}

export const DEFAULT_SETTINGS: LiteParsePluginSettings = {
	replaceExistingParsedBlock: true,
	createSeparateParsedNoteWhenNoLinkedNoteFound: true,
	outputFolderModeForFallbackNote: "same-folder",
	customOutputFolderForFallbackNote: "",
	openOutputAfterParsing: true,
	includeLiteParseAttributionInNote: true,
	includeParsedTimestamp: true,
	parsedContentHeading: "Parsed PDF content",
	outputFormat: "markdown",
	includeLiteParseJson: false,
	jsonSidecar: false,
	ocrEnabled: false,
	ocrLanguage: "en",
	maxPages: null,
	pageRange: "",
	parseTimeoutSeconds: 300,
	debugLogging: false,

	extractionMode: "reflow",
	includePageHeadings: true,
	pageDivider: "---",
	collapseBlankLines: true,

	bulletReplacement: "-",
	detectBoldItalic: true,
	detectHeadings: true,
	headingFontMultiplier: 1.3,
	promoteTitleSlides: true,

	templates: [],
};

export interface PdfLinkMatch {
	/** The raw matched text exactly as it appears in the note (e.g. `![[file.pdf]]`). */
	rawText: string;
	/** Character offset of the match within the note. */
	startOffset: number;
	/** End offset of the match within the note. */
	endOffset: number;
	/** Vault-relative path referenced by the link, if it could be resolved. */
	resolvedPath: string | null;
	/** Path as written in the link source. */
	rawTarget: string;
	/** Line number (0-based) where the match starts. */
	lineNumber: number;
}
