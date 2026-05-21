import { App, FileSystemAdapter, Modal, Notice, TFile } from "obsidian";
import { tmpdir } from "os";
import { join } from "path";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import {
	liteparseScreenshot,
	resolvePluginPaths,
} from "./installer";
import LiteParsePlugin from "./main";
import { TemplateRegion } from "./types";
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

export class VisualRegionEditorModal extends Modal {
	private readonly plugin: LiteParsePlugin;
	private readonly onSave: (regions: TemplateRegion[]) => void;
	private readonly initialRegions: TemplateRegion[];
	private readonly initialPdfPath?: string;

	private pdf: TFile | null = null;
	private pageNumber = 1;
	private screenshotPath: string | null = null;
	private tmpDir: string | null = null;

	private imgEl: HTMLImageElement | null = null;
	private overlayEl: HTMLDivElement | null = null;
	private listEl: HTMLDivElement | null = null;
	private statusEl: HTMLDivElement | null = null;

	private regions: DraftRegion[] = [];
	private currentRole: "include" | "exclude" = "exclude";

	constructor(
		app: App,
		plugin: LiteParsePlugin,
		initialRegions: TemplateRegion[],
		onSave: (regions: TemplateRegion[]) => void,
		initialPdfPath?: string,
	) {
		super(app);
		this.plugin = plugin;
		this.onSave = onSave;
		this.initialRegions = initialRegions;
		this.initialPdfPath = initialPdfPath;
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

		const roleSelect = ctrl.createEl("select");
		roleSelect.createEl("option", { text: "exclude", value: "exclude" });
		roleSelect.createEl("option", { text: "include", value: "include" });
		roleSelect.addEventListener("change", () => {
			this.currentRole = roleSelect.value as "include" | "exclude";
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
		this.renderRegionList();

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
			const out: TemplateRegion[] = this.regions.map((r) => ({
				name: r.name,
				role: r.role,
				x: Math.round(r.xPct * 100) / 100,
				y: Math.round(r.yPct * 100) / 100,
				w: Math.round(r.wPct * 100) / 100,
				h: Math.round(r.hPct * 100) / 100,
			}));
			this.onSave(out);
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
			// Build base64 data URL — bytes are small (single PNG page).
			const b64 = bytes.toString("base64");
			if (this.imgEl) this.imgEl.src = `data:image/png;base64,${b64}`;
			this.setStatus(
				`Loaded ${this.pdf.name} page ${this.pageNumber}. Drag on the page to draw a region. ` +
				`Current role: ${this.currentRole}.`,
			);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			this.setStatus(`Failed to render page: ${msg}`, true);
		}
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

	private renderRegionOverlays(): void {
		if (!this.overlayEl) return;
		this.overlayEl
			.querySelectorAll(".liteparse-vis-rect")
			.forEach((el) => el.remove());
		this.rectEls.clear();
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
				div.style.background = `${color}33`; // ~20% alpha hex
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
