import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import LiteParsePlugin from "./main";
import {
	ExtractionMode,
	OutputFormat,
	ParsingTemplate,
	ProbeAction,
	TemplateProbe,
	TemplateRegion,
} from "./types";
import { VisualRegionEditorModal } from "./visualEditor";

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

		const singleMode = this.plugin.settings.singleContentMode;

		new Setting(containerEl)
			.setName("Single-content mode")
			.setDesc(
				"Treat the entire PDF as one flowing document — no `### Page N` " +
				"headings, no page dividers, no title-slide promotion. Useful for " +
				"articles, books, or any PDF where page boundaries are not " +
				"meaningful in the parsed output.",
			)
			.addToggle((t) =>
				t.setValue(this.plugin.settings.singleContentMode).onChange(async (v) => {
					this.plugin.settings.singleContentMode = v;
					await this.plugin.saveSettings();
					this.display();
				}),
			);

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

		const pageHeadingSetting = new Setting(containerEl)
			.setName("Include page headings")
			.setDesc("Insert `### Page N` before each page's content.")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.includePageHeadings)
					.setDisabled(singleMode)
					.onChange(async (v) => {
						this.plugin.settings.includePageHeadings = v;
						await this.plugin.saveSettings();
					}),
			);
		if (singleMode) pageHeadingSetting.settingEl.addClass("liteparse-setting-disabled");

		const dividerSetting = new Setting(containerEl)
			.setName("Page divider")
			.setDesc('Inserted between pages. Leave empty for no divider. Common choices: "---", "***".')
			.addText((t) =>
				t
					.setPlaceholder("---")
					.setValue(this.plugin.settings.pageDivider)
					.setDisabled(singleMode)
					.onChange(async (v) => {
						this.plugin.settings.pageDivider = v;
						await this.plugin.saveSettings();
					}),
			);
		if (singleMode) dividerSetting.settingEl.addClass("liteparse-setting-disabled");

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
			.setName("Auto-detect two-column layouts")
			.setDesc(
				"When a page (or single body region) clearly contains two text " +
				"columns separated by a vertical gutter, emit them in reading " +
				"order — left column first, then right. Conservative gates avoid " +
				"misfires on single-column pages. Manual two-include-region " +
				"templates always override this.",
			)
			.addToggle((t) =>
				t.setValue(this.plugin.settings.autoDetectColumns).onChange(async (v) => {
					this.plugin.settings.autoDetectColumns = v;
					await this.plugin.saveSettings();
				}),
			);

		containerEl.createEl("h3", { text: "Markup detection" });

		new Setting(containerEl)
			.setName("Bullet replacement")
			.setDesc(
				"When a line starts with an unparseable bullet glyph (e.g. �, •, ●, ▪), " +
				"replace it with this string + space. Leave empty to keep the original glyph.",
			)
			.addText((t) =>
				t
					.setPlaceholder("-")
					.setValue(this.plugin.settings.bulletReplacement)
					.onChange(async (v) => {
						this.plugin.settings.bulletReplacement = v;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Detect bold / italic")
			.setDesc(
				"Wrap whole lines in **bold** or *italic* when LiteParse reports a " +
				"bold/italic font name for every text item on the line.",
			)
			.addToggle((t) =>
				t.setValue(this.plugin.settings.detectBoldItalic).onChange(async (v) => {
					this.plugin.settings.detectBoldItalic = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Detect headings")
			.setDesc(
				"Emit short lines as `## title` or `### title` when their font size " +
				"is significantly larger than the document's median font size.",
			)
			.addToggle((t) =>
				t.setValue(this.plugin.settings.detectHeadings).onChange(async (v) => {
					this.plugin.settings.detectHeadings = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Heading size multiplier")
			.setDesc("A line whose font size is at least (median × this) is a heading candidate. Default 1.3.")
			.addText((t) =>
				t
					.setPlaceholder("1.3")
					.setValue(String(this.plugin.settings.headingFontMultiplier))
					.onChange(async (v) => {
						const n = Number(v);
						this.plugin.settings.headingFontMultiplier =
							Number.isFinite(n) && n > 1 ? n : 1.3;
						await this.plugin.saveSettings();
					}),
			);

		const titleSlideSetting = new Setting(containerEl)
			.setName("Promote title-only slides")
			.setDesc(
				"When a page contains only heading-sized lines (e.g. a section " +
				"divider slide like 'AI and Knowledge'), emit it as a top-level " +
				"`## Title` instead of `### Page N` + content + divider.",
			)
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.promoteTitleSlides)
					.setDisabled(singleMode)
					.onChange(async (v) => {
						this.plugin.settings.promoteTitleSlides = v;
						await this.plugin.saveSettings();
					}),
			);
		if (singleMode) titleSlideSetting.settingEl.addClass("liteparse-setting-disabled");

		new Setting(containerEl)
			.setName("Merge consecutive same-level headings")
			.setDesc(
				"Combine consecutive headings of the same level (e.g. `#### A` then " +
				"`#### B`) into one heading. Useful when a slide title is wrapped " +
				"across multiple lines in the original PDF.",
			)
			.addToggle((t) =>
				t.setValue(this.plugin.settings.mergeConsecutiveHeadings).onChange(async (v) => {
					this.plugin.settings.mergeConsecutiveHeadings = v;
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
			"Define page regions to exclude (headers/footers/page numbers) or " +
			"include (multi-column body) per PDF. Coordinates are percentages " +
			"of the page with (0,0) at the top-left. The first template whose ",
		);
		p.createEl("code", { text: "match" });
		p.appendText(" regex matches the PDF's vault path wins.");

		const list = containerEl.createDiv({ cls: "liteparse-templates-list" });
		this.renderTemplateCards(list);

		const addRow = containerEl.createDiv();
		addRow.style.display = "flex";
		addRow.style.gap = "0.5rem";
		addRow.style.marginTop = "0.5rem";

		const addBtn = addRow.createEl("button", { text: "+ Add template" });
		addBtn.onclick = async () => {
			this.plugin.settings.templates.push({
				name: `template_${this.plugin.settings.templates.length + 1}`,
				match: ".*\\.pdf$",
				pages: "",
				regions: [],
			});
			await this.plugin.saveSettings();
			this.renderTemplateCards(list);
		};

		const advancedBtn = addRow.createEl("button", { text: "Advanced JSON editor…" });
		advancedBtn.onclick = () => this.openAdvancedJsonEditor();
	}

	private renderTemplateCards(list: HTMLElement): void {
		list.empty();
		const templates = this.plugin.settings.templates;
		if (templates.length === 0) {
			const empty = list.createEl("p", {
				text: "No templates yet. Click + Add template, or use the visual editor.",
			});
			empty.style.color = "var(--text-muted)";
			return;
		}
		templates.forEach((tpl, idx) => {
			const card = list.createDiv({ cls: "liteparse-settings-section" });
			card.style.padding = "0.5rem 0.75rem";
			card.style.marginTop = "0.75rem";
			card.style.border = "1px solid var(--background-modifier-border)";
			card.style.borderRadius = "6px";

			const head = card.createDiv();
			head.style.display = "flex";
			head.style.gap = "0.5rem";
			head.style.alignItems = "center";
			head.style.flexWrap = "wrap";

			const nameInput = head.createEl("input", { type: "text" });
			nameInput.value = tpl.name;
			nameInput.placeholder = "Template name";
			nameInput.style.flex = "1 1 12rem";
			nameInput.onchange = async () => {
				tpl.name = nameInput.value;
				await this.plugin.saveSettings();
			};

			const upBtn = head.createEl("button", { text: "▲" });
			upBtn.title = "Move up (try first)";
			upBtn.onclick = async () => {
				if (idx === 0) return;
				const arr = this.plugin.settings.templates;
				[arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
				await this.plugin.saveSettings();
				this.renderTemplateCards(list);
			};

			const downBtn = head.createEl("button", { text: "▼" });
			downBtn.title = "Move down";
			downBtn.onclick = async () => {
				const arr = this.plugin.settings.templates;
				if (idx >= arr.length - 1) return;
				[arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
				await this.plugin.saveSettings();
				this.renderTemplateCards(list);
			};

			const delBtn = head.createEl("button", { text: "Delete" });
			delBtn.onclick = async () => {
				this.plugin.settings.templates.splice(idx, 1);
				await this.plugin.saveSettings();
				this.renderTemplateCards(list);
			};

			const matchRow = card.createDiv();
			matchRow.style.marginTop = "0.4rem";
			matchRow.style.display = "grid";
			matchRow.style.gridTemplateColumns = "auto 1fr";
			matchRow.style.gap = "0.5rem";
			matchRow.style.alignItems = "center";

			matchRow.createSpan({ text: "Match (regex):" });
			const matchInput = matchRow.createEl("input", { type: "text" });
			matchInput.value = tpl.match;
			matchInput.style.fontFamily = "var(--font-monospace)";
			matchInput.style.fontSize = "0.9em";
			matchInput.onchange = async () => {
				try {
					new RegExp(matchInput.value);
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					new Notice(`Invalid regex: ${msg}`);
					matchInput.value = tpl.match;
					return;
				}
				tpl.match = matchInput.value;
				await this.plugin.saveSettings();
			};

			matchRow.createSpan({ text: "Pages:" });
			const pagesInput = matchRow.createEl("input", { type: "text" });
			pagesInput.value = tpl.pages ?? "";
			pagesInput.placeholder = "empty = all (e.g. 1-5,10)";
			pagesInput.onchange = async () => {
				tpl.pages = pagesInput.value;
				await this.plugin.saveSettings();
			};

			this.renderRegionRows(card, tpl);
			this.renderProbeRows(card, tpl);
		});
	}

	private renderProbeRows(card: HTMLElement, tpl: ParsingTemplate): void {
		const wrap = card.createDiv();
		wrap.style.marginTop = "0.75rem";
		const head = wrap.createDiv();
		head.style.fontWeight = "600";
		head.style.fontSize = "0.9em";
		head.setText("Probes (optional pre-classification)");
		const desc = wrap.createEl("p");
		desc.style.fontSize = "0.8em";
		desc.style.color = "var(--text-muted)";
		desc.style.margin = "0.15rem 0 0.4rem 0";
		desc.setText(
			"Define a small page area, a regex to test against text in that " +
			"area, and an action. First matching probe wins. Use to detect " +
			"exceptional pages and skip them or dispatch to another template.",
		);

		const probes = tpl.probes ?? [];

		const tbl = wrap.createEl("table");
		tbl.style.width = "100%";
		tbl.style.fontSize = "0.85em";
		const thead = tbl.createEl("thead").createEl("tr");
		for (const h of ["Name", "x", "y", "w", "h", "Pattern", "Flags", "On match", "Target", "↑", "↓", ""]) {
			const th = thead.createEl("th", { text: h });
			th.style.textAlign = "left";
		}
		const tbody = tbl.createEl("tbody");

		const ensureProbes = (): TemplateProbe[] => {
			if (!tpl.probes) tpl.probes = [];
			return tpl.probes;
		};

		const drawRow = (probe: TemplateProbe, idx: number) => {
			const tr = tbody.createEl("tr");
			const mkInput = (
				type: "text" | "number",
				value: string,
				width: string,
				placeholder: string,
				onChange: (v: string) => void,
			) => {
				const td = tr.createEl("td");
				const input = td.createEl("input", { type });
				input.value = value;
				input.style.width = width;
				input.placeholder = placeholder;
				if (type === "number") input.step = "0.1";
				input.onchange = () => onChange(input.value);
				return input;
			};

			mkInput("text", probe.name, "8rem", "probe_1", async (v) => {
				probe.name = v;
				await this.plugin.saveSettings();
			});
			for (const k of ["x", "y", "w", "h"] as const) {
				mkInput("number", String(probe[k]), "4rem", "", async (v) => {
					const n = Number(v);
					if (Number.isFinite(n)) {
						probe[k] = n;
						await this.plugin.saveSettings();
					}
				});
			}
			const patternInput = mkInput(
				"text",
				probe.pattern,
				"10rem",
				"^Exercise\\b",
				async (v) => {
					probe.pattern = v;
					await this.plugin.saveSettings();
				},
			);
			patternInput.style.fontFamily = "var(--font-monospace)";
			const flagsInput = mkInput("text", probe.flags ?? "", "3rem", "i", async (v) => {
				if (v) probe.flags = v;
				else delete probe.flags;
				await this.plugin.saveSettings();
			});
			flagsInput.style.fontFamily = "var(--font-monospace)";

			const actionTd = tr.createEl("td");
			const actionSel = actionTd.createEl("select");
			actionSel.createEl("option", { text: "Use this template", value: "use-current" });
			actionSel.createEl("option", { text: "Skip page", value: "skip" });
			actionSel.createEl("option", { text: "Switch to…", value: "switch" });
			actionSel.value = probe.onMatch.kind;

			const targetTd = tr.createEl("td");
			const renderTarget = () => {
				targetTd.empty();
				if (probe.onMatch.kind !== "switch") {
					const span = targetTd.createSpan({ text: "—" });
					span.style.color = "var(--text-muted)";
					return;
				}
				const sel = targetTd.createEl("select");
				const others = this.plugin.settings.templates
					.map((t) => t.name)
					.filter((n) => n && n !== tpl.name);
				if (others.length === 0) {
					sel.createEl("option", { text: "(no other templates)", value: "" });
					sel.disabled = true;
				} else {
					sel.createEl("option", { text: "—", value: "" });
					for (const name of others) sel.createEl("option", { text: name, value: name });
					sel.value = (probe.onMatch as { templateName: string }).templateName ?? "";
				}
				sel.onchange = async () => {
					probe.onMatch = { kind: "switch", templateName: sel.value };
					await this.plugin.saveSettings();
				};
			};
			renderTarget();

			actionSel.onchange = async () => {
				const kind = actionSel.value as ProbeAction["kind"];
				if (kind === "skip") probe.onMatch = { kind: "skip" };
				else if (kind === "use-current") probe.onMatch = { kind: "use-current" };
				else probe.onMatch = { kind: "switch", templateName: "" };
				await this.plugin.saveSettings();
				renderTarget();
			};

			const upTd = tr.createEl("td");
			const up = upTd.createEl("button", { text: "▲" });
			up.onclick = async () => {
				const arr = ensureProbes();
				if (idx === 0) return;
				[arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
				await this.plugin.saveSettings();
				this.display();
			};
			const downTd = tr.createEl("td");
			const down = downTd.createEl("button", { text: "▼" });
			down.onclick = async () => {
				const arr = ensureProbes();
				if (idx >= arr.length - 1) return;
				[arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
				await this.plugin.saveSettings();
				this.display();
			};

			const delTd = tr.createEl("td");
			const del = delTd.createEl("button", { text: "×" });
			del.onclick = async () => {
				const arr = ensureProbes();
				arr.splice(idx, 1);
				if (arr.length === 0) tpl.probes = undefined;
				await this.plugin.saveSettings();
				this.display();
			};
		};
		probes.forEach(drawRow);

		const addBtn = wrap.createEl("button", { text: "+ Probe" });
		addBtn.style.marginTop = "0.3rem";
		addBtn.onclick = async () => {
			const arr = ensureProbes();
			arr.push({
				name: `probe_${arr.length + 1}`,
				x: 0,
				y: 0,
				w: 30,
				h: 8,
				pattern: "",
				onMatch: { kind: "use-current" },
			});
			await this.plugin.saveSettings();
			this.display();
		};
	}

	private renderRegionRows(card: HTMLElement, tpl: ParsingTemplate): void {
		const tbl = card.createEl("table");
		tbl.style.width = "100%";
		tbl.style.marginTop = "0.5rem";
		tbl.style.fontSize = "0.85em";
		const head = tbl.createEl("thead").createEl("tr");
		for (const h of ["Region", "Role", "x", "y", "w", "h", "H#", ""]) {
			const th = head.createEl("th", { text: h });
			th.style.textAlign = "left";
		}
		const tbody = tbl.createEl("tbody");
		const drawRow = (region: TemplateRegion, idx: number) => {
			const tr = tbody.createEl("tr");
			const mkInput = (
				type: "text" | "number",
				value: string,
				width: string,
				onChange: (v: string) => void,
			) => {
				const td = tr.createEl("td");
				const input = td.createEl("input", { type });
				input.value = value;
				input.style.width = width;
				if (type === "number") input.step = "0.1";
				input.onchange = () => onChange(input.value);
				return input;
			};

			mkInput("text", region.name, "9rem", async (v) => {
				region.name = v;
				await this.plugin.saveSettings();
			});

			const roleTd = tr.createEl("td");
			const sel = roleTd.createEl("select");
			sel.createEl("option", { text: "exclude", value: "exclude" });
			sel.createEl("option", { text: "include", value: "include" });
			sel.value = region.role;
			sel.onchange = async () => {
				region.role = sel.value as "include" | "exclude";
				await this.plugin.saveSettings();
			};

			for (const k of ["x", "y", "w", "h"] as const) {
				mkInput("number", String(region[k]), "4.5rem", async (v) => {
					const n = Number(v);
					if (Number.isFinite(n)) {
						region[k] = n;
						await this.plugin.saveSettings();
					}
				});
			}

			const hlTd = tr.createEl("td");
			const hlInput = hlTd.createEl("input", { type: "number" });
			hlInput.min = "1";
			hlInput.max = "6";
			hlInput.style.width = "3.5rem";
			hlInput.value = region.headingLevel ? String(region.headingLevel) : "";
			hlInput.placeholder = "—";
			hlInput.onchange = async () => {
				const n = Number(hlInput.value);
				if (Number.isFinite(n) && n >= 1 && n <= 6) {
					region.headingLevel = n;
				} else {
					delete region.headingLevel;
				}
				await this.plugin.saveSettings();
			};

			const delTd = tr.createEl("td");
			const del = delTd.createEl("button", { text: "×" });
			del.onclick = async () => {
				tpl.regions.splice(idx, 1);
				await this.plugin.saveSettings();
				this.display();
			};
		};
		tpl.regions.forEach(drawRow);

		const btnRow = card.createDiv();
		btnRow.style.display = "flex";
		btnRow.style.gap = "0.5rem";
		btnRow.style.marginTop = "0.4rem";

		const addRegionBtn = btnRow.createEl("button", { text: "+ Region" });
		addRegionBtn.onclick = async () => {
			tpl.regions.push({
				name: `region_${tpl.regions.length + 1}`,
				role: "exclude",
				x: 0,
				y: 0,
				w: 100,
				h: 10,
			});
			await this.plugin.saveSettings();
			this.display();
		};

		const visualBtn = btnRow.createEl("button", { text: "Edit visually…" });
		visualBtn.onclick = () => {
			const initialPdfPath = this.guessInitialPdfPath(tpl);
			const siblings = this.plugin.settings.templates
				.map((t) => t.name)
				.filter((n) => n && n !== tpl.name);
			new VisualRegionEditorModal(
				this.app,
				this.plugin,
				tpl.regions,
				tpl.probes ?? [],
				siblings,
				async ({ regions, probes }) => {
					tpl.regions = regions;
					tpl.probes = probes.length ? probes : undefined;
					await this.plugin.saveSettings();
					new Notice(
						`LiteParse: saved ${regions.length} region(s) and ${probes.length} probe(s) for ${tpl.name}.`,
					);
					this.display();
				},
				initialPdfPath,
			).open();
		};
	}

	/**
	 * Best-effort: pick a vault PDF whose path matches the template's regex,
	 * so the visual editor opens with something useful already loaded.
	 */
	private guessInitialPdfPath(tpl: ParsingTemplate): string | undefined {
		let re: RegExp;
		try {
			re = new RegExp(tpl.match);
		} catch {
			return undefined;
		}
		const pdfs = this.app.vault
			.getFiles()
			.filter((f) => f.extension.toLowerCase() === "pdf");
		const hit = pdfs.find((f) => re.test(f.path));
		return hit?.path;
	}

	private openAdvancedJsonEditor(): void {
		const modal = new (class extends (require("obsidian").Modal as typeof import("obsidian").Modal) {
			content: string;
			plugin: LiteParsePlugin;
			tab: LiteParseSettingTab;
			constructor(app: App, plugin: LiteParsePlugin, tab: LiteParseSettingTab) {
				super(app);
				this.plugin = plugin;
				this.tab = tab;
				this.content = JSON.stringify(plugin.settings.templates, null, 2);
			}
			onOpen(): void {
				const { contentEl } = this;
				contentEl.empty();
				contentEl.createEl("h2", { text: "Templates JSON" });
				const ta = contentEl.createEl("textarea");
				ta.value = this.content;
				ta.rows = 20;
				ta.style.width = "100%";
				ta.style.fontFamily = "var(--font-monospace)";
				ta.style.fontSize = "0.85em";
				const status = contentEl.createDiv();
				status.style.fontSize = "0.85em";
				status.style.marginTop = "0.25rem";
				const row = contentEl.createDiv();
				row.style.display = "flex";
				row.style.gap = "0.5rem";
				row.style.marginTop = "0.5rem";
				const save = row.createEl("button", { text: "Save" });
				save.classList.add("mod-cta");
				const cancel = row.createEl("button", { text: "Cancel" });
				save.onclick = async () => {
					try {
						const parsed = JSON.parse(ta.value);
						if (!Array.isArray(parsed)) throw new Error("Top-level must be an array.");
						this.plugin.settings.templates = parsed as ParsingTemplate[];
						await this.plugin.saveSettings();
						new Notice("LiteParse: templates saved.");
						this.close();
						this.tab.display();
					} catch (err) {
						const msg = err instanceof Error ? err.message : String(err);
						status.setText(`Invalid JSON: ${msg}`);
						status.style.color = "var(--text-error)";
					}
				};
				cancel.onclick = () => this.close();
			}
		})(this.app, this.plugin, this);
		modal.open();
	}
}
