import { App, FileSystemAdapter, Modal, Notice, TFile } from "obsidian";
import { tmpdir } from "os";
import { join } from "path";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import {
	liteparseParsePage,
	liteparseScreenshot,
	LiteParsePageJson,
	LiteParseTextItem,
	resolvePluginPaths,
} from "./installer";
import LiteParsePlugin from "./main";
import { ProbeAction, TemplateProbe, TemplateRegion } from "./types";
import { PdfFileSuggestModal } from "./suggestModals";

interface DraftRegion {
	id: number;
	name: string;
	role: "include" | "exclude";
	xPct: number;
	yPct: number;
	wPct: number;
	hPct: number;
}

interface DraftProbe {
	id: number;
	name: string;
	xPct: number;
	yPct: number;
	wPct: number;
	hPct: number;
	pattern: string;
	flags: string;
	actionKind: "skip" | "use-current" | "switch";
	targetTemplate: string;
}

type DrawingMode = "regions" | "probes";

const PROBE_COLOR = "#d22dc4";

let nextId = 1;

const REGION_COLORS = [
	"#e3603e",
	"#3eaae3",
	"#6bb05f",
	"#b366e3",
	"#e3c93e",
	"#3ee3c0",
	"#e33e94",
	"#7c8de3",
	"#e38e3e",
	"#5fe3a1",
	"#c14a4a",
	"#4a8cc1",
];

function colorForIndex(i: number): string {
	return REGION_COLORS[i % REGION_COLORS.length];
}

export interface VisualEditorResult {
	regions: TemplateRegion[];
	probes: TemplateProbe[];
}

export class VisualRegionEditorModal extends Modal {
	private readonly plugin: LiteParsePlugin;
	private readonly onSave: (result: VisualEditorResult) => void;
	private readonly initialRegions: TemplateRegion[];
	private readonly initialProbes: TemplateProbe[];
	private readonly siblingTemplateNames: string[];
	private readonly initialPdfPath?: string;

	private pdf: TFile | null = null;
	private pageNumber = 1;
	private screenshotPath: string | null = null;
	private tmpDir: string | null = null;

	private imgEl: HTMLImageElement | null = null;
	private overlayEl: HTMLDivElement | null = null;
	private listEl: HTMLDivElement | null = null;
	private probeListEl: HTMLDivElement | null = null;
	private statusEl: HTMLDivElement | null = null;
	private roleSelectEl: HTMLSelectElement | null = null;

	private regions: DraftRegion[] = [];
	private probes: DraftProbe[] = [];
	private currentRole: "include" | "exclude" = "exclude";
	private mode: DrawingMode = "regions";
	private currentPage: LiteParsePageJson | null = null;

	constructor(
		app: App,
		plugin: LiteParsePlugin,
		initialRegions: TemplateRegion[],
		initialProbes: TemplateProbe[],
		siblingTemplateNames: string[],
		onSave: (result: VisualEditorResult) => void,
		initialPdfPath?: string,
		initialMode: DrawingMode = "regions",
	) {
		super(app);
		this.plugin = plugin;
		this.onSave = onSave;
		this.initialRegions = initialRegions;
		this.initialProbes = initialProbes;
		this.siblingTemplateNames = siblingTemplateNames;
		this.initialPdfPath = initialPdfPath;
		this.mode = initialMode;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Visual region editor" });

		this.regions = this.initialRegions.map((r) => ({
			id: nextId++,
			name: r.name,
			role: r.role,
			xPct: r.x,
			yPct: r.y,
			wPct: r.w,
			hPct: r.h,
		}));
		this.probes = this.initialProbes.map((p) => ({
			id: nextId++,
			name: p.name,
			xPct: p.x,
			yPct: p.y,
			wPct: p.w,
			hPct: p.h,
			pattern: p.pattern,
			flags: p.flags ?? "",
			actionKind: p.onMatch.kind,
			targetTemplate:
				p.onMatch.kind === "switch" ? p.onMatch.templateName : "",
		}));

		const ctrl = contentEl.createDiv();
		ctrl.style.display = "flex";
		ctrl.style.gap = "0.5rem";
		ctrl.style.flexWrap = "wrap";
		ctrl.style.alignItems = "center";
		ctrl.style.marginBottom = "0.5rem";

		const pickBtn = ctrl.createEl("button", { text: "Choose PDF…" });
		const pdfLabel = ctrl.createSpan({ text: "(none)" });
		pdfLabel.style.fontFamily = "var(--font-monospace)";
		pdfLabel.style.fontSize = "0.85em";

		const pageInput = ctrl.createEl("input", { type: "number" });
		pageInput.value = "1";
		pageInput.min = "1";
		pageInput.style.width = "5rem";

		const loadBtn = ctrl.createEl("button", { text: "Load page" });

		ctrl.createSpan({ text: "Draw:" }).style.marginLeft = "0.75rem";
		const modeSelect = ctrl.createEl("select");
		modeSelect.createEl("option", { text: "Regions", value: "regions" });
		modeSelect.createEl("option", { text: "Probes", value: "probes" });
		modeSelect.value = this.mode;

		const roleSelect = ctrl.createEl("select");
		roleSelect.createEl("option", { text: "exclude", value: "exclude" });
		roleSelect.createEl("option", { text: "include", value: "include" });
		roleSelect.addEventListener("change", () => {
			this.currentRole = roleSelect.value as "include" | "exclude";
		});
		roleSelect.style.display = this.mode === "regions" ? "" : "none";
		this.roleSelectEl = roleSelect;

		modeSelect.addEventListener("change", () => {
			this.mode = modeSelect.value as DrawingMode;
			if (this.roleSelectEl) {
				this.roleSelectEl.style.display =
					this.mode === "regions" ? "" : "none";
			}
			this.setStatus(
				this.mode === "probes"
					? "Probe mode. Drag a small area; set its regex + action below."
					: `Region mode. Current role: ${this.currentRole}.`,
			);
		});

		this.statusEl = contentEl.createDiv();
		this.statusEl.style.fontSize = "0.85em";
		this.statusEl.style.color = "var(--text-muted)";
		this.statusEl.style.minHeight = "1.2em";

		const stage = contentEl.createDiv();
		stage.style.position = "relative";
		stage.style.userSelect = "none";
		stage.style.display = "inline-block";
		stage.style.maxWidth = "100%";
		stage.style.border = "1px solid var(--background-modifier-border)";
		stage.style.marginTop = "0.5rem";

		this.imgEl = stage.createEl("img");
		this.imgEl.style.display = "block";
		this.imgEl.style.maxWidth = "100%";
		this.imgEl.style.maxHeight = "55vh";
		this.imgEl.draggable = false;

		this.overlayEl = stage.createDiv();
		const ov = this.overlayEl;
		ov.style.position = "absolute";
		ov.style.top = "0";
		ov.style.left = "0";
		ov.style.right = "0";
		ov.style.bottom = "0";
		ov.style.cursor = "crosshair";
		this.attachDrawHandlers(ov);

		this.listEl = contentEl.createDiv();
		this.listEl.style.marginTop = "0.5rem";

		const probeHeader = contentEl.createEl("h4", { text: "Probes (pre-classification)" });
		probeHeader.style.marginTop = "0.75rem";
		probeHeader.style.marginBottom = "0.25rem";

		this.probeListEl = contentEl.createDiv();
		this.renderRegionList();
		this.renderProbeList();

		const btnRow = contentEl.createDiv();
		btnRow.style.display = "flex";
		btnRow.style.gap = "0.5rem";
		btnRow.style.marginTop = "0.75rem";

		const saveBtn = btnRow.createEl("button", { text: "Save regions" });
		saveBtn.classList.add("mod-cta");
		const cancelBtn = btnRow.createEl("button", { text: "Cancel" });

		pickBtn.onclick = () => {
			const pdfs = this.app.vault.getFiles().filter((f) => f.extension.toLowerCase() === "pdf");
			if (pdfs.length === 0) {
				new Notice("No PDFs in vault.");
				return;
			}
			new PdfFileSuggestModal(this.app, pdfs, (file) => {
				this.pdf = file;
				pdfLabel.setText(file.path);
				void this.loadPage();
			}).open();
		};

		loadBtn.onclick = () => {
			const n = Number(pageInput.value);
			if (!Number.isFinite(n) || n < 1) {
				new Notice("Page must be ≥ 1.");
				return;
			}
			this.pageNumber = Math.floor(n);
			void this.loadPage();
		};

		saveBtn.onclick = () => {
			const regions: TemplateRegion[] = this.regions.map((r) => ({
				name: r.name,
				role: r.role,
				x: Math.round(r.xPct * 100) / 100,
				y: Math.round(r.yPct * 100) / 100,
				w: Math.round(r.wPct * 100) / 100,
				h: Math.round(r.hPct * 100) / 100,
			}));
			const probes: TemplateProbe[] = this.probes.map((p) => {
				const onMatch: ProbeAction =
					p.actionKind === "skip"
						? { kind: "skip" }
						: p.actionKind === "switch" && p.targetTemplate
							? { kind: "switch", templateName: p.targetTemplate }
							: { kind: "use-current" };
				const out: TemplateProbe = {
					name: p.name,
					x: Math.round(p.xPct * 100) / 100,
					y: Math.round(p.yPct * 100) / 100,
					w: Math.round(p.wPct * 100) / 100,
					h: Math.round(p.hPct * 100) / 100,
					pattern: p.pattern,
					onMatch,
				};
				if (p.flags) out.flags = p.flags;
				return out;
			});
			this.onSave({ regions, probes });
			this.close();
		};

		cancelBtn.onclick = () => this.close();

		if (this.initialPdfPath) {
			const f = this.app.vault.getAbstractFileByPath(this.initialPdfPath);
			if (f instanceof TFile && f.extension.toLowerCase() === "pdf") {
				this.pdf = f;
				pdfLabel.setText(f.path);
				void this.loadPage();
			}
		}
	}

	onClose(): void {
		if (this.tmpDir) {
			try {
				rmSync(this.tmpDir, { recursive: true, force: true });
			} catch (err) {
				console.warn("[liteparse-pdf-parser] tmp cleanup", err);
			}
			this.tmpDir = null;
		}
		this.contentEl.empty();
	}

	private setStatus(msg: string, isError = false): void {
		if (!this.statusEl) return;
		this.statusEl.setText(msg);
		this.statusEl.style.color = isError ? "var(--text-error)" : "var(--text-muted)";
	}

	private async loadPage(): Promise<void> {
		if (!this.pdf) {
			this.setStatus("Pick a PDF first.", true);
			return;
		}
		const adapter = this.app.vault.adapter;
		if (!(adapter instanceof FileSystemAdapter)) {
			this.setStatus("Visual editor needs the desktop filesystem adapter.", true);
			return;
		}
		this.setStatus(`Rendering page ${this.pageNumber}…`);
		try {
			const paths = resolvePluginPaths(this.plugin);
			if (!this.tmpDir) {
				this.tmpDir = mkdtempSync(join(tmpdir(), "liteparse-vis-"));
			}
			const abs = adapter.getFullPath(this.pdf.path);
			const pngPath = await liteparseScreenshot(
				paths,
				abs,
				this.pageNumber,
				this.tmpDir,
				this.plugin.settings.debugLogging,
			);
			this.screenshotPath = pngPath;
			const bytes = readFileSync(pngPath);
			const b64 = bytes.toString("base64");
			if (this.imgEl) this.imgEl.src = `data:image/png;base64,${b64}`;
			this.setStatus(
				`Loaded ${this.pdf.name} page ${this.pageNumber}. Drag on the page to draw a region. ` +
				`Current role: ${this.currentRole}.`,
			);
			// Pull text items for the page so probe rows can preview the text
			// that falls inside each rectangle. Don't block the screenshot —
			// run as a background fetch, refresh probe list when it lands.
			void liteparseParsePage(paths, abs, this.pageNumber, this.plugin.settings.debugLogging)
				.then((p) => {
					this.currentPage = p;
					this.renderProbeList();
				})
				.catch((err) => {
					if (this.plugin.settings.debugLogging)
						console.debug("[liteparse-pdf-parser] page parse failed", err);
				});
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			this.setStatus(`Failed to render page: ${msg}`, true);
		}
	}

	private extractTextForRect(
		xPct: number,
		yPct: number,
		wPct: number,
		hPct: number,
	): string {
		const page = this.currentPage;
		if (!page) return "";
		const items = page.textItems;
		if (!items || items.length === 0) return "";
		const x = Math.max(0, Math.min(100, xPct));
		const y = Math.max(0, Math.min(100, yPct));
		const w = Math.max(0, Math.min(100 - x, wPct));
		const h = Math.max(0, Math.min(100 - y, hPct));
		const xMin = (x / 100) * page.width;
		const xMax = ((x + w) / 100) * page.width;
		const yMin = (y / 100) * page.height;
		const yMax = ((y + h) / 100) * page.height;
		const inside: LiteParseTextItem[] = [];
		for (const it of items) {
			const ix = Number(it.x ?? 0);
			const iy = Number(it.y ?? 0);
			const iw = Number(it.width ?? it.w ?? 0);
			const ih = Number(it.height ?? it.h ?? it.fontSize ?? 0);
			const cx = ix + iw / 2;
			const cy = iy + ih / 2;
			if (cx >= xMin && cx <= xMax && cy >= yMin && cy <= yMax) inside.push(it);
		}
		if (inside.length === 0) return "";
		inside.sort((a, b) => {
			const ay = Number(a.y ?? 0);
			const by = Number(b.y ?? 0);
			if (Math.abs(ay - by) > 0.5) return ay - by;
			return Number(a.x ?? 0) - Number(b.x ?? 0);
		});
		return inside
			.map((it) => String(it.text ?? it.str ?? ""))
			.join(" ")
			.replace(/\s+/g, " ")
			.trim();
	}

	private attachDrawHandlers(overlay: HTMLDivElement): void {
		let drawing: HTMLDivElement | null = null;
		let startX = 0;
		let startY = 0;

		const toPct = (clientX: number, clientY: number): { x: number; y: number } => {
			const rect = overlay.getBoundingClientRect();
			const x = ((clientX - rect.left) / rect.width) * 100;
			const y = ((clientY - rect.top) / rect.height) * 100;
			return {
				x: Math.max(0, Math.min(100, x)),
				y: Math.max(0, Math.min(100, y)),
			};
		};

		overlay.addEventListener("mousedown", (e: MouseEvent) => {
			if (!this.imgEl?.src) return;
			// Ignore mousedown that originated on an existing region rect —
			// otherwise hovering an overlapping rect creates accidental new
			// rects on click.
			const target = e.target as HTMLElement;
			if (target.classList?.contains("liteparse-vis-rect")) return;
			e.preventDefault();
			const { x, y } = toPct(e.clientX, e.clientY);
			startX = x;
			startY = y;
			drawing = overlay.createDiv();
			drawing.style.position = "absolute";
			drawing.style.border = "2px dashed var(--interactive-accent)";
			drawing.style.background = "rgba(var(--interactive-accent-rgb), 0.15)";
			drawing.style.left = `${x}%`;
			drawing.style.top = `${y}%`;
			drawing.style.width = "0";
			drawing.style.height = "0";
			drawing.style.pointerEvents = "none";
		});

		overlay.addEventListener("mousemove", (e: MouseEvent) => {
			if (!drawing) return;
			const { x, y } = toPct(e.clientX, e.clientY);
			const lo = Math.min(startX, x);
			const to = Math.min(startY, y);
			const wd = Math.abs(x - startX);
			const ht = Math.abs(y - startY);
			drawing.style.left = `${lo}%`;
			drawing.style.top = `${to}%`;
			drawing.style.width = `${wd}%`;
			drawing.style.height = `${ht}%`;
		});

		overlay.addEventListener("mouseup", (e: MouseEvent) => {
			if (!drawing) return;
			const { x, y } = toPct(e.clientX, e.clientY);
			drawing.remove();
			drawing = null;
			const lo = Math.min(startX, x);
			const to = Math.min(startY, y);
			const wd = Math.abs(x - startX);
			const ht = Math.abs(y - startY);
			if (wd < 1 || ht < 1) return; // ignore tiny clicks
			if (this.mode === "probes") {
				const probe: DraftProbe = {
					id: nextId++,
					name: `probe_${this.probes.length + 1}`,
					xPct: lo,
					yPct: to,
					wPct: wd,
					hPct: ht,
					pattern: "",
					flags: "",
					actionKind: "use-current",
					targetTemplate: "",
				};
				this.probes.push(probe);
				this.renderProbeList();
				this.renderRegionOverlays();
				return;
			}
			const region: DraftRegion = {
				id: nextId++,
				name:
					this.currentRole === "exclude"
						? `exclude_${this.regions.filter((r) => r.role === "exclude").length + 1}`
						: `region_${this.regions.filter((r) => r.role === "include").length + 1}`,
				role: this.currentRole,
				xPct: lo,
				yPct: to,
				wPct: wd,
				hPct: ht,
			};
			this.regions.push(region);
			this.renderRegionList();
			this.renderRegionOverlays();
		});
	}

	private rectEls: Map<number, HTMLDivElement> = new Map();
	private rowEls: Map<number, HTMLTableRowElement> = new Map();
	private probeRectEls: Map<number, HTMLDivElement> = new Map();
	private probeRowEls: Map<number, HTMLTableRowElement> = new Map();

	private renderRegionOverlays(): void {
		if (!this.overlayEl) return;
		this.overlayEl
			.querySelectorAll(".liteparse-vis-rect")
			.forEach((el) => el.remove());
		this.rectEls.clear();
		this.probeRectEls.clear();
		this.regions.forEach((r, idx) => {
			const div = this.overlayEl!.createDiv({ cls: "liteparse-vis-rect" });
			div.style.position = "absolute";
			div.style.left = `${r.xPct}%`;
			div.style.top = `${r.yPct}%`;
			div.style.width = `${r.wPct}%`;
			div.style.height = `${r.hPct}%`;
			div.style.boxSizing = "border-box";
			div.style.cursor = "pointer";
			div.style.transition = "background 80ms ease, z-index 0s";
			const color = colorForIndex(idx);
			const borderStyle = r.role === "include" ? "dashed" : "solid";
			div.style.border = `2px ${borderStyle} ${color}`;
			div.style.background = "transparent";
			div.style.zIndex = "1";
			div.dataset.regionId = String(r.id);

			const label = div.createDiv({ text: `${r.name} (${r.role})` });
			label.style.position = "absolute";
			label.style.top = "-1.05em";
			label.style.left = "-2px";
			label.style.padding = "0 4px";
			label.style.background = color;
			label.style.color = "#fff";
			label.style.fontSize = "0.7em";
			label.style.fontWeight = "600";
			label.style.borderRadius = "2px 2px 0 0";
			label.style.whiteSpace = "nowrap";
			label.style.pointerEvents = "none";

			const hoverIn = () => {
				div.style.background = `${color}33`;
				div.style.zIndex = "10";
				const row = this.rowEls.get(r.id);
				if (row) row.style.background = `${color}1f`;
			};
			const hoverOut = () => {
				div.style.background = "transparent";
				div.style.zIndex = "1";
				const row = this.rowEls.get(r.id);
				if (row) row.style.background = "";
			};
			div.addEventListener("mouseenter", hoverIn);
			div.addEventListener("mouseleave", hoverOut);

			this.rectEls.set(r.id, div);
		});

		this.probes.forEach((p) => {
			const div = this.overlayEl!.createDiv({ cls: "liteparse-vis-rect" });
			div.style.position = "absolute";
			div.style.left = `${p.xPct}%`;
			div.style.top = `${p.yPct}%`;
			div.style.width = `${p.wPct}%`;
			div.style.height = `${p.hPct}%`;
			div.style.boxSizing = "border-box";
			div.style.cursor = "pointer";
			div.style.transition = "background 80ms ease, z-index 0s";
			div.style.border = `2px dotted ${PROBE_COLOR}`;
			div.style.background = "transparent";
			div.style.zIndex = "2";
			div.dataset.probeId = String(p.id);

			const label = div.createDiv({ text: `probe: ${p.name}` });
			label.style.position = "absolute";
			label.style.top = "-1.05em";
			label.style.left = "-2px";
			label.style.padding = "0 4px";
			label.style.background = PROBE_COLOR;
			label.style.color = "#fff";
			label.style.fontSize = "0.7em";
			label.style.fontWeight = "600";
			label.style.borderRadius = "2px 2px 0 0";
			label.style.whiteSpace = "nowrap";
			label.style.pointerEvents = "none";

			const hoverIn = () => {
				div.style.background = `${PROBE_COLOR}33`;
				div.style.zIndex = "11";
				const row = this.probeRowEls.get(p.id);
				if (row) row.style.background = `${PROBE_COLOR}1f`;
			};
			const hoverOut = () => {
				div.style.background = "transparent";
				div.style.zIndex = "2";
				const row = this.probeRowEls.get(p.id);
				if (row) row.style.background = "";
			};
			div.addEventListener("mouseenter", hoverIn);
			div.addEventListener("mouseleave", hoverOut);

			this.probeRectEls.set(p.id, div);
		});
	}

	private renderProbeList(): void {
		if (!this.probeListEl) return;
		this.probeListEl.empty();
		const tbl = this.probeListEl.createEl("table");
		tbl.style.width = "100%";
		tbl.style.fontSize = "0.85em";
		const thead = tbl.createEl("thead").createEl("tr");
		for (const h of ["", "Name", "x", "y", "w", "h", "Pattern", "Flags", "Action", "Target", ""]) {
			const th = thead.createEl("th", { text: h });
			th.style.textAlign = "left";
		}
		const tbody = tbl.createEl("tbody");
		this.probeRowEls.clear();
		if (this.probes.length === 0) {
			const tr = tbody.createEl("tr");
			const td = tr.createEl("td");
			td.colSpan = 11;
			td.style.color = "var(--text-muted)";
			td.setText(
				"No probes. Switch Draw to Probes and drag a small area on the page to add one.",
			);
		}
		const previewCells: Array<{ probeId: number; el: HTMLElement }> = [];
		const refreshPreview = (probeId: number) => {
			const cell = previewCells.find((p) => p.probeId === probeId);
			if (!cell) return;
			const probe = this.probes.find((p) => p.id === probeId);
			if (!probe) return;
			const text = this.extractTextForRect(probe.xPct, probe.yPct, probe.wPct, probe.hPct);
			if (!this.currentPage) {
				cell.el.setText("(load a page to preview probe text)");
				cell.el.style.color = "var(--text-muted)";
			} else if (!text) {
				cell.el.setText("(no text in this area on this page)");
				cell.el.style.color = "var(--text-muted)";
			} else {
				cell.el.setText(text);
				cell.el.style.color = "var(--text-normal)";
			}
		};

		this.probes.forEach((probe, idx) => {
			const tr = tbody.createEl("tr");
			tr.style.transition = "background 80ms ease";
			this.probeRowEls.set(probe.id, tr);
			tr.addEventListener("mouseenter", () => {
				const rect = this.probeRectEls.get(probe.id);
				if (rect) {
					rect.style.background = `${PROBE_COLOR}33`;
					rect.style.zIndex = "11";
				}
				tr.style.background = `${PROBE_COLOR}1f`;
			});
			tr.addEventListener("mouseleave", () => {
				const rect = this.probeRectEls.get(probe.id);
				if (rect) {
					rect.style.background = "transparent";
					rect.style.zIndex = "2";
				}
				tr.style.background = "";
			});

			const swatchTd = tr.createEl("td");
			const sw = swatchTd.createSpan();
			sw.style.display = "inline-block";
			sw.style.width = "0.9em";
			sw.style.height = "0.9em";
			sw.style.borderRadius = "2px";
			sw.style.background = PROBE_COLOR;

			const nameTd = tr.createEl("td");
			const nameInput = nameTd.createEl("input", { type: "text" });
			nameInput.value = probe.name;
			nameInput.style.width = "8rem";
			nameInput.onchange = () => {
				probe.name = nameInput.value;
				this.renderRegionOverlays();
			};

			for (const k of ["xPct", "yPct", "wPct", "hPct"] as const) {
				const td = tr.createEl("td");
				const input = td.createEl("input", { type: "number" });
				input.step = "0.1";
				input.style.width = "4.5rem";
				input.value = String(Math.round((probe[k] as number) * 100) / 100);
				input.onchange = () => {
					const n = Number(input.value);
					if (Number.isFinite(n)) {
						(probe as unknown as Record<string, number>)[k] = n;
						this.renderRegionOverlays();
						refreshPreview(probe.id);
					}
				};
			}

			const patternTd = tr.createEl("td");
			const patternInput = patternTd.createEl("input", { type: "text" });
			patternInput.value = probe.pattern;
			patternInput.placeholder = "^Exercise\\b";
			patternInput.style.width = "10rem";
			patternInput.style.fontFamily = "var(--font-monospace)";
			patternInput.onchange = () => {
				probe.pattern = patternInput.value;
			};

			const flagsTd = tr.createEl("td");
			const flagsInput = flagsTd.createEl("input", { type: "text" });
			flagsInput.value = probe.flags;
			flagsInput.placeholder = "i";
			flagsInput.style.width = "3rem";
			flagsInput.style.fontFamily = "var(--font-monospace)";
			flagsInput.onchange = () => {
				probe.flags = flagsInput.value;
			};

			const actionTd = tr.createEl("td");
			const actionSel = actionTd.createEl("select");
			actionSel.createEl("option", { text: "Use this template", value: "use-current" });
			actionSel.createEl("option", { text: "Skip page", value: "skip" });
			actionSel.createEl("option", { text: "Switch to…", value: "switch" });
			actionSel.value = probe.actionKind;

			const targetTd = tr.createEl("td");
			const renderTarget = () => {
				targetTd.empty();
				if (probe.actionKind !== "switch") {
					const span = targetTd.createSpan({ text: "—" });
					span.style.color = "var(--text-muted)";
					return;
				}
				const sel = targetTd.createEl("select");
				if (this.siblingTemplateNames.length === 0) {
					sel.createEl("option", { text: "(no other templates)", value: "" });
					sel.disabled = true;
				} else {
					sel.createEl("option", { text: "—", value: "" });
					for (const name of this.siblingTemplateNames) {
						sel.createEl("option", { text: name, value: name });
					}
					sel.value = probe.targetTemplate;
				}
				sel.onchange = () => {
					probe.targetTemplate = sel.value;
				};
			};
			renderTarget();

			actionSel.onchange = () => {
				probe.actionKind = actionSel.value as DraftProbe["actionKind"];
				renderTarget();
			};

			const delTd = tr.createEl("td");
			const delBtn = delTd.createEl("button", { text: "×" });
			delBtn.onclick = () => {
				this.probes = this.probes.filter((p) => p.id !== probe.id);
				this.renderProbeList();
				this.renderRegionOverlays();
			};

			const previewTr = tbody.createEl("tr");
			const labelTd = previewTr.createEl("td");
			labelTd.setText("text:");
			labelTd.style.color = "var(--text-muted)";
			labelTd.style.fontSize = "0.8em";
			labelTd.style.textAlign = "right";
			labelTd.style.paddingRight = "0.4rem";
			const previewTd = previewTr.createEl("td");
			previewTd.colSpan = 10;
			previewTd.style.fontFamily = "var(--font-monospace)";
			previewTd.style.fontSize = "0.8em";
			previewTd.style.whiteSpace = "normal";
			previewTd.style.wordBreak = "break-word";
			previewTd.style.padding = "0.1rem 0 0.4rem 0";
			previewCells.push({ probeId: probe.id, el: previewTd });
			refreshPreview(probe.id);
			void idx;
		});
	}

	private renderRegionList(): void {
		if (!this.listEl) return;
		this.listEl.empty();
		if (this.regions.length === 0) {
			this.listEl.createEl("p", {
				text: "No regions yet. Drag on the page above to draw one.",
			}).style.color = "var(--text-muted)";
			this.renderRegionOverlays();
			return;
		}
		const tbl = this.listEl.createEl("table");
		tbl.style.width = "100%";
		tbl.style.fontSize = "0.85em";
		const thead = tbl.createEl("thead").createEl("tr");
		for (const h of ["", "Name", "Role", "x", "y", "w", "h", ""]) {
			const th = thead.createEl("th", { text: h });
			th.style.textAlign = "left";
		}
		const tbody = tbl.createEl("tbody");
		this.rowEls.clear();
		this.regions.forEach((region, idx) => {
			const tr = tbody.createEl("tr");
			tr.style.transition = "background 80ms ease";
			this.rowEls.set(region.id, tr);
			tr.addEventListener("mouseenter", () => {
				const rect = this.rectEls.get(region.id);
				if (rect) {
					rect.style.background = `${colorForIndex(idx)}33`;
					rect.style.zIndex = "10";
				}
				tr.style.background = `${colorForIndex(idx)}1f`;
			});
			tr.addEventListener("mouseleave", () => {
				const rect = this.rectEls.get(region.id);
				if (rect) {
					rect.style.background = "transparent";
					rect.style.zIndex = "1";
				}
				tr.style.background = "";
			});

			const swatchTd = tr.createEl("td");
			const sw = swatchTd.createSpan();
			sw.style.display = "inline-block";
			sw.style.width = "0.9em";
			sw.style.height = "0.9em";
			sw.style.borderRadius = "2px";
			sw.style.background = colorForIndex(idx);
			sw.style.marginRight = "0.25rem";

			const nameTd = tr.createEl("td");
			const nameInput = nameTd.createEl("input", { type: "text" });
			nameInput.value = region.name;
			nameInput.style.width = "100%";
			nameInput.onchange = () => {
				region.name = nameInput.value;
				this.renderRegionOverlays();
			};

			const roleTd = tr.createEl("td");
			const roleSel = roleTd.createEl("select");
			roleSel.createEl("option", { text: "exclude", value: "exclude" });
			roleSel.createEl("option", { text: "include", value: "include" });
			roleSel.value = region.role;
			roleSel.onchange = () => {
				region.role = roleSel.value as "include" | "exclude";
				this.renderRegionOverlays();
			};

			for (const k of ["xPct", "yPct", "wPct", "hPct"] as const) {
				const td = tr.createEl("td");
				const input = td.createEl("input", { type: "number" });
				input.step = "0.1";
				input.style.width = "5rem";
				input.value = String(Math.round((region[k] as number) * 100) / 100);
				input.onchange = () => {
					const n = Number(input.value);
					if (Number.isFinite(n)) {
						(region as unknown as Record<string, number>)[k] = n;
						this.renderRegionOverlays();
					}
				};
			}

			const delTd = tr.createEl("td");
			const delBtn = delTd.createEl("button", { text: "×" });
			delBtn.onclick = () => {
				this.regions = this.regions.filter((r) => r.id !== region.id);
				this.renderRegionList();
			};
		});
		this.renderRegionOverlays();
	}
}
