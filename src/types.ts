export type OutputFormat = "markdown" | "text" | "json";

export type FallbackFolderMode = "same-folder" | "custom-folder";

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
