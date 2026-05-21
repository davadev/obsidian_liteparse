import { App, FuzzySuggestModal, TFile } from "obsidian";
import { PdfLinkMatch } from "./types";

export class PdfFileSuggestModal extends FuzzySuggestModal<TFile> {
	private readonly files: TFile[];
	private readonly onChoose: (file: TFile) => void;

	constructor(app: App, files: TFile[], onChoose: (file: TFile) => void) {
		super(app);
		this.files = files;
		this.onChoose = onChoose;
		this.setPlaceholder("Select a PDF to parse");
	}

	getItems(): TFile[] {
		return this.files;
	}

	getItemText(file: TFile): string {
		return file.path;
	}

	onChooseItem(file: TFile): void {
		this.onChoose(file);
	}
}

export class NoteSuggestModal extends FuzzySuggestModal<TFile> {
	private readonly notes: TFile[];
	private readonly onChoose: (file: TFile) => void;

	constructor(app: App, notes: TFile[], onChoose: (file: TFile) => void) {
		super(app);
		this.notes = notes;
		this.onChoose = onChoose;
		this.setPlaceholder("Multiple notes link this PDF — choose target");
	}

	getItems(): TFile[] {
		return this.notes;
	}

	getItemText(file: TFile): string {
		return file.path;
	}

	onChooseItem(file: TFile): void {
		this.onChoose(file);
	}
}

export class PdfLinkSuggestModal extends FuzzySuggestModal<PdfLinkMatch> {
	private readonly matches: PdfLinkMatch[];
	private readonly onChoose: (m: PdfLinkMatch) => void;

	constructor(app: App, matches: PdfLinkMatch[], onChoose: (m: PdfLinkMatch) => void) {
		super(app);
		this.matches = matches;
		this.onChoose = onChoose;
		this.setPlaceholder("Multiple PDF links found — choose one");
	}

	getItems(): PdfLinkMatch[] {
		return this.matches;
	}

	getItemText(m: PdfLinkMatch): string {
		const target = m.resolvedPath ?? m.rawTarget;
		return `${target} — line ${m.lineNumber + 1}`;
	}

	onChooseItem(m: PdfLinkMatch): void {
		this.onChoose(m);
	}
}
