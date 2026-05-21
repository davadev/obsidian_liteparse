import { App, PluginSettingTab, Setting } from "obsidian";
import LiteParsePlugin from "./main";
import { OutputFormat } from "./types";

export class LiteParseSettingTab extends PluginSettingTab {
	plugin: LiteParsePlugin;

	constructor(app: App, plugin: LiteParsePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("p", {
			text:
				"This plugin wraps LiteParse (Run Llama / LlamaIndex) to parse PDFs " +
				"locally. Parsed Markdown is inserted into the note that links the PDF.",
		});

		new Setting(containerEl)
			.setName("Replace existing parsed block")
			.setDesc(
				"If a parsed block already exists for the same PDF in the note, " +
				"replace it instead of appending a new one.",
			)
			.addToggle((t) =>
				t.setValue(this.plugin.settings.replaceExistingParsedBlock).onChange(async (v) => {
					this.plugin.settings.replaceExistingParsedBlock = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Open note after parsing")
			.setDesc("Open the target note in the active leaf when parsing finishes.")
			.addToggle((t) =>
				t.setValue(this.plugin.settings.openOutputAfterParsing).onChange(async (v) => {
					this.plugin.settings.openOutputAfterParsing = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Include LiteParse attribution in note")
			.setDesc("Insert a one-line credit linking to LiteParse in each parsed block.")
			.addToggle((t) =>
				t.setValue(this.plugin.settings.includeLiteParseAttributionInNote).onChange(async (v) => {
					this.plugin.settings.includeLiteParseAttributionInNote = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Include parsed timestamp")
			.setDesc("Include a 'Parsed on: ...' line in each parsed block.")
			.addToggle((t) =>
				t.setValue(this.plugin.settings.includeParsedTimestamp).onChange(async (v) => {
					this.plugin.settings.includeParsedTimestamp = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Parsed content heading")
			.setDesc("Heading text used for the parsed block.")
			.addText((t) =>
				t
					.setPlaceholder("Parsed PDF content")
					.setValue(this.plugin.settings.parsedContentHeading)
					.onChange(async (v) => {
						this.plugin.settings.parsedContentHeading = v;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Output format")
			.setDesc(
				"Markdown is the default and recommended. Text/JSON wrap the LiteParse " +
				"result in a fenced code block.",
			)
			.addDropdown((d) =>
				d
					.addOption("markdown", "Markdown (recommended)")
					.addOption("text", "Plain text")
					.addOption("json", "JSON")
					.setValue(this.plugin.settings.outputFormat)
					.onChange(async (v) => {
						this.plugin.settings.outputFormat = v as OutputFormat;
						await this.plugin.saveSettings();
					}),
			);

		containerEl.createEl("h3", { text: "Fallback parsed note" });

		new Setting(containerEl)
			.setName("Create separate parsed note when no linking note is found")
			.setDesc(
				"When a PDF is parsed from the file explorer and no Markdown note links " +
				"to it, create a separate <pdf>.parsed.md note.",
			)
			.addToggle((t) =>
				t.setValue(this.plugin.settings.createSeparateParsedNoteWhenNoLinkedNoteFound).onChange(async (v) => {
					this.plugin.settings.createSeparateParsedNoteWhenNoLinkedNoteFound = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Fallback note location")
			.addDropdown((d) =>
				d
					.addOption("same-folder", "Same folder as the PDF")
					.addOption("custom-folder", "Custom folder")
					.setValue(this.plugin.settings.outputFolderModeForFallbackNote)
					.onChange(async (v) => {
						this.plugin.settings.outputFolderModeForFallbackNote =
							v === "custom-folder" ? "custom-folder" : "same-folder";
						await this.plugin.saveSettings();
						this.display();
					}),
			);

		if (this.plugin.settings.outputFolderModeForFallbackNote === "custom-folder") {
			new Setting(containerEl)
				.setName("Custom fallback folder")
				.setDesc("Vault-relative folder for fallback parsed notes.")
				.addText((t) =>
					t
						.setPlaceholder("Parsed PDFs")
						.setValue(this.plugin.settings.customOutputFolderForFallbackNote)
						.onChange(async (v) => {
							this.plugin.settings.customOutputFolderForFallbackNote = v;
							await this.plugin.saveSettings();
						}),
				);
		}

		containerEl.createEl("h3", { text: "Advanced LiteParse options" });
		containerEl.createEl("p", {
			text:
				"These flags pass through to LiteParse. Only options officially supported " +
				"by the installed @llamaindex/liteparse version are exposed.",
		});

		new Setting(containerEl)
			.setName("OCR")
			.setDesc(
				"Run OCR on text-sparse regions. Useful for scanned PDFs but slower " +
				"and may need additional system dependencies (see LiteParse docs).",
			)
			.addToggle((t) =>
				t.setValue(this.plugin.settings.ocrEnabled).onChange(async (v) => {
					this.plugin.settings.ocrEnabled = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("OCR language")
			.setDesc("ISO 639-3 (Tesseract) or 639-1 code. Default: en.")
			.addText((t) =>
				t
					.setPlaceholder("en")
					.setValue(this.plugin.settings.ocrLanguage)
					.onChange(async (v) => {
						this.plugin.settings.ocrLanguage = v;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Max pages")
			.setDesc("Cap the number of pages parsed. Leave empty for no cap.")
			.addText((t) =>
				t
					.setPlaceholder("")
					.setValue(this.plugin.settings.maxPages == null ? "" : String(this.plugin.settings.maxPages))
					.onChange(async (v) => {
						const n = v.trim() === "" ? null : Number(v);
						this.plugin.settings.maxPages =
							Number.isFinite(n as number) && (n as number) > 0 ? (n as number) : null;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Page range")
			.setDesc('e.g. "1-3,5,7-9". Empty means all pages.')
			.addText((t) =>
				t
					.setPlaceholder("")
					.setValue(this.plugin.settings.pageRange)
					.onChange(async (v) => {
						this.plugin.settings.pageRange = v;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Parse timeout (seconds)")
			.setDesc("Abort parsing if it does not finish within this many seconds.")
			.addText((t) =>
				t
					.setPlaceholder("300")
					.setValue(String(this.plugin.settings.parseTimeoutSeconds))
					.onChange(async (v) => {
						const n = Number(v);
						this.plugin.settings.parseTimeoutSeconds =
							Number.isFinite(n) && n > 0 ? Math.floor(n) : 300;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Include LiteParse JSON in note")
			.setDesc("When using Markdown output, append the raw LiteParse JSON in a collapsible section.")
			.addToggle((t) =>
				t.setValue(this.plugin.settings.includeLiteParseJson).onChange(async (v) => {
					this.plugin.settings.includeLiteParseJson = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Debug logging")
			.setDesc("Log parser options and result shape to the developer console.")
			.addToggle((t) =>
				t.setValue(this.plugin.settings.debugLogging).onChange(async (v) => {
					this.plugin.settings.debugLogging = v;
					await this.plugin.saveSettings();
				}),
			);
	}
}
