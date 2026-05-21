import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import LiteParsePlugin from "./main";
import { ExtractionMode, OutputFormat, ParsingTemplate } from "./types";

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

		containerEl.createEl("h3", { text: "Readability" });

		new Setting(containerEl)
			.setName("Extraction mode")
			.setDesc(
				"Reflow rebuilds clean lines from LiteParse's positioned textItems " +
				"(recommended). Raw uses LiteParse's per-page text verbatim, " +
				"preserving original spacing.",
			)
			.addDropdown((d) =>
				d
					.addOption("reflow", "Reflow (clean, recommended)")
					.addOption("raw", "Raw (preserve PDF layout)")
					.setValue(this.plugin.settings.extractionMode)
					.onChange(async (v) => {
						this.plugin.settings.extractionMode = v as ExtractionMode;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Include page headings")
			.setDesc("Insert `### Page N` before each page's content.")
			.addToggle((t) =>
				t.setValue(this.plugin.settings.includePageHeadings).onChange(async (v) => {
					this.plugin.settings.includePageHeadings = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Page divider")
			.setDesc('Inserted between pages. Leave empty for no divider. Common choices: "---", "***".')
			.addText((t) =>
				t
					.setPlaceholder("---")
					.setValue(this.plugin.settings.pageDivider)
					.onChange(async (v) => {
						this.plugin.settings.pageDivider = v;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Collapse blank lines")
			.setDesc("Collapse runs of 3+ blank lines down to one. Trims trailing whitespace per line.")
			.addToggle((t) =>
				t.setValue(this.plugin.settings.collapseBlankLines).onChange(async (v) => {
					this.plugin.settings.collapseBlankLines = v;
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

		this.renderTemplatesSection(containerEl);
	}

	private renderTemplatesSection(containerEl: HTMLElement): void {
		containerEl.createEl("h3", { text: "Parsing templates" });
		const p = containerEl.createEl("p");
		p.appendText(
			"Define page regions to exclude (e.g. headers/footers) or include " +
			"(e.g. multi-column body). Coordinates are percentages of the page, " +
			"with (0,0) at the top-left. The first template whose ",
		);
		p.createEl("code", { text: "match" });
		p.appendText(
			" regex matches the PDF's vault path is applied. Schema:",
		);
		const schema = containerEl.createEl("pre");
		schema.createEl("code", {
			text:
				`[
  {
    "name": "lecture-slides",
    "match": "_resources/.*lecture.*\\\\.pdf",
    "pages": "",
    "regions": [
      { "name": "header", "role": "exclude", "x": 0, "y": 0,  "w": 100, "h": 8  },
      { "name": "footer", "role": "exclude", "x": 0, "y": 92, "w": 100, "h": 8  },
      { "name": "body",   "role": "include", "x": 0, "y": 8,  "w": 100, "h": 84 }
    ]
  }
]`,
		});

		const initial = JSON.stringify(this.plugin.settings.templates, null, 2);
		const wrap = containerEl.createDiv();
		const ta = wrap.createEl("textarea", { cls: "liteparse-templates-editor" });
		ta.value = initial;
		ta.rows = 14;
		ta.spellcheck = false;
		ta.style.width = "100%";
		ta.style.fontFamily = "var(--font-monospace)";
		ta.style.fontSize = "0.85em";

		const status = wrap.createDiv({ cls: "liteparse-templates-status" });
		status.style.fontSize = "0.85em";
		status.style.marginTop = "0.25rem";

		const setStatus = (msg: string, ok: boolean) => {
			status.setText(msg);
			status.style.color = ok ? "var(--text-success)" : "var(--text-error)";
		};

		const btnRow = wrap.createDiv();
		btnRow.style.display = "flex";
		btnRow.style.gap = "0.5rem";
		btnRow.style.marginTop = "0.5rem";

		const saveBtn = btnRow.createEl("button", { text: "Save templates" });
		const formatBtn = btnRow.createEl("button", { text: "Format" });
		const clearBtn = btnRow.createEl("button", { text: "Clear" });

		const parse = (raw: string): ParsingTemplate[] | null => {
			const trimmed = raw.trim();
			if (!trimmed) return [];
			let parsed: unknown;
			try {
				parsed = JSON.parse(trimmed);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				setStatus(`Invalid JSON: ${msg}`, false);
				return null;
			}
			if (!Array.isArray(parsed)) {
				setStatus("Top-level value must be a JSON array of templates.", false);
				return null;
			}
			// Best-effort shape validation; unknown fields ignored.
			for (let i = 0; i < parsed.length; i++) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const t: any = parsed[i];
				if (!t || typeof t !== "object") {
					setStatus(`Template #${i + 1} is not an object.`, false);
					return null;
				}
				if (typeof t.name !== "string" || typeof t.match !== "string") {
					setStatus(`Template #${i + 1} requires string "name" and "match".`, false);
					return null;
				}
				if (!Array.isArray(t.regions)) {
					setStatus(`Template #${i + 1} requires a "regions" array.`, false);
					return null;
				}
				try {
					new RegExp(t.match);
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					setStatus(`Template #${i + 1}: invalid match regex — ${msg}`, false);
					return null;
				}
				for (let j = 0; j < t.regions.length; j++) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const r: any = t.regions[j];
					if (!r || typeof r !== "object") {
						setStatus(`Template #${i + 1} region #${j + 1} is not an object.`, false);
						return null;
					}
					if (r.role !== "include" && r.role !== "exclude") {
						setStatus(`Template #${i + 1} region #${j + 1}: role must be "include" or "exclude".`, false);
						return null;
					}
					for (const k of ["x", "y", "w", "h"] as const) {
						if (typeof r[k] !== "number" || !Number.isFinite(r[k])) {
							setStatus(`Template #${i + 1} region #${j + 1}: "${k}" must be a number.`, false);
							return null;
						}
					}
				}
			}
			return parsed as ParsingTemplate[];
		};

		saveBtn.onclick = async () => {
			const parsed = parse(ta.value);
			if (parsed === null) return;
			this.plugin.settings.templates = parsed;
			await this.plugin.saveSettings();
			setStatus(`Saved ${parsed.length} template(s).`, true);
			new Notice("LiteParse: templates saved.");
		};
		formatBtn.onclick = () => {
			const parsed = parse(ta.value);
			if (parsed === null) return;
			ta.value = JSON.stringify(parsed, null, 2);
			setStatus("Formatted.", true);
		};
		clearBtn.onclick = async () => {
			ta.value = "[]";
			this.plugin.settings.templates = [];
			await this.plugin.saveSettings();
			setStatus("Cleared.", true);
		};
	}
}
