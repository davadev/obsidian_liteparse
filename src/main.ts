import {
	Editor,
	MarkdownFileInfo,
	MarkdownView,
	Menu,
	Notice,
	Plugin,
	TAbstractFile,
	TFile,
} from "obsidian";
import { DEFAULT_SETTINGS, LiteParsePluginSettings, PdfLinkMatch } from "./types";
import { LiteParseSettingTab } from "./settings";
import {
	findNotesLinkingPdf,
	findPdfLinks,
	matchesForPdf,
} from "./linkDetection";
import {
	NormalizedParseResult,
	getAbsolutePath,
	parsePdf,
} from "./parser";
import {
	applyParsedBlockToNote,
	writeFallbackParsedNote,
} from "./noteInsertion";
import {
	NoteSuggestModal,
	PdfFileSuggestModal,
	PdfLinkSuggestModal,
} from "./suggestModals";

export default class LiteParsePlugin extends Plugin {
	settings!: LiteParsePluginSettings;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new LiteParseSettingTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu: Menu, file: TAbstractFile) => {
				if (file instanceof TFile && file.extension.toLowerCase() === "pdf") {
					menu.addItem((item) => {
						item
							.setTitle("Parse PDF with LiteParse")
							.setIcon("file-text")
							.onClick(() => {
								void this.handleParsePdfFromExplorer(file);
							});
					});
				}
			}),
		);

		this.registerEvent(
			this.app.workspace.on(
				"editor-menu",
				(menu: Menu, _editor: Editor, info: MarkdownView | MarkdownFileInfo) => {
					const file = info.file;
					if (!file || file.extension !== "md") return;
					menu.addItem((item) => {
						item
							.setTitle("Parse linked PDF with LiteParse")
							.setIcon("file-text")
							.onClick(() => {
								void this.handleParseFromActiveNote(file);
							});
					});
				},
			),
		);

		this.addCommand({
			id: "parse-pdf-in-current-note",
			name: "Parse PDF linked in current note with LiteParse",
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md") return false;
				if (checking) return true;
				void this.handleParseFromActiveNote(file);
				return true;
			},
		});

		this.addCommand({
			id: "parse-selected-or-current-pdf",
			name: "Parse selected/current PDF with LiteParse",
			callback: () => {
				const file = this.app.workspace.getActiveFile();
				if (!file) {
					new Notice("LiteParse: no active file.");
					return;
				}
				if (file.extension.toLowerCase() === "pdf") {
					void this.handleParsePdfFromExplorer(file);
					return;
				}
				if (file.extension === "md") {
					void this.handleParseFromActiveNote(file);
					return;
				}
				new Notice("LiteParse: active file is not a PDF or Markdown note.");
			},
		});

	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private async handleParsePdfFromExplorer(pdf: TFile): Promise<void> {
		const linkingNotes = findNotesLinkingPdf(this.app, pdf);

		if (linkingNotes.length === 0) {
			if (!this.settings.createSeparateParsedNoteWhenNoLinkedNoteFound) {
				new Notice(
					`LiteParse: no note links "${pdf.path}". Enable the fallback ` +
					`setting to create a separate parsed note.`,
				);
				return;
			}
			const result = await this.runParse(pdf);
			if (!result) return;
			try {
				const out = await writeFallbackParsedNote(this.app, pdf, result, this.settings);
				new Notice(`LiteParse: wrote ${out.path}`);
				if (this.settings.openOutputAfterParsing) {
					await this.app.workspace.getLeaf(false).openFile(out);
				}
			} catch (err) {
				this.reportError("failed to write fallback parsed note", err);
			}
			return;
		}

		if (linkingNotes.length === 1) {
			await this.parsePdfInTargetNote(pdf, linkingNotes[0]);
			return;
		}

		new NoteSuggestModal(this.app, linkingNotes, (note) => {
			void this.parsePdfInTargetNote(pdf, note);
		}).open();
	}

	private async handleParseFromActiveNote(note: TFile): Promise<void> {
		if (note.extension !== "md") {
			new Notice("LiteParse: active file is not a Markdown note.");
			return;
		}
		const content = await this.app.vault.cachedRead(note);
		const links = findPdfLinks(this.app, content, note.path);
		if (links.length === 0) {
			new Notice("LiteParse: no PDF links found in this note.");
			return;
		}
		const choose = (match: PdfLinkMatch) =>
			void this.parsePdfAtMatch(note, match);
		if (links.length === 1) {
			choose(links[0]);
			return;
		}
		new PdfLinkSuggestModal(this.app, links, choose).open();
	}

	private async parsePdfInTargetNote(pdf: TFile, note: TFile): Promise<void> {
		const content = await this.app.vault.cachedRead(note);
		const allLinks = findPdfLinks(this.app, content, note.path);
		const matches = matchesForPdf(allLinks, pdf.path);
		if (matches.length === 0) {
			new Notice(
				`LiteParse: ${note.path} is reported as linking ${pdf.path} ` +
				`but no link could be located in the file.`,
			);
			return;
		}
		const apply = (match: PdfLinkMatch) =>
			void this.runParseAndInsert(pdf, note, match);
		if (matches.length === 1) {
			apply(matches[0]);
			return;
		}
		new PdfLinkSuggestModal(this.app, matches, apply).open();
	}

	private async parsePdfAtMatch(note: TFile, match: PdfLinkMatch): Promise<void> {
		if (!match.resolvedPath) {
			new Notice(`LiteParse: could not resolve "${match.rawTarget}" inside the vault.`);
			return;
		}
		const pdf = this.app.vault.getAbstractFileByPath(match.resolvedPath);
		if (!(pdf instanceof TFile)) {
			new Notice(`LiteParse: "${match.resolvedPath}" is not a vault file.`);
			return;
		}
		await this.runParseAndInsert(pdf, note, match);
	}

	private async runParseAndInsert(
		pdf: TFile,
		note: TFile,
		match: PdfLinkMatch,
	): Promise<void> {
		const result = await this.runParse(pdf);
		if (!result) return;
		try {
			await applyParsedBlockToNote(
				this.app,
				note,
				match,
				pdf.path,
				result,
				this.settings,
			);
			new Notice(`LiteParse: inserted parsed content into ${note.path}`);
			if (this.settings.openOutputAfterParsing) {
				await this.app.workspace.getLeaf(false).openFile(note);
			}
		} catch (err) {
			this.reportError("failed to insert parsed content", err);
		}
	}

	private async runParse(pdf: TFile): Promise<NormalizedParseResult | null> {
		const notice = new Notice(`LiteParse: parsing ${pdf.name}…`, 0);
		try {
			const abs = getAbsolutePath(this.app.vault, pdf);
			const result = await parsePdf(this, abs, pdf.path, this.settings);
			notice.hide();
			if (this.settings.debugLogging) {
				console.debug("[liteparse-pdf-parser] parse result", {
					pageCount: result.pageCount,
					textLen: result.text.length,
					markdownLen: result.markdown.length,
				});
			}
			return result;
		} catch (err) {
			notice.hide();
			this.reportError(`parse failed for ${pdf.name}`, err);
			return null;
		}
	}

	private reportError(label: string, err: unknown): void {
		const msg = err instanceof Error ? err.message : String(err);
		new Notice(`LiteParse: ${label} — ${msg}`, 10_000);
		console.error("[liteparse-pdf-parser]", label, err);
	}
}
