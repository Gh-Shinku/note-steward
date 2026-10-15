import { App, Modal, TFile } from 'obsidian';
import { filterDocumentTree } from '../core/model';
import { translations } from '../i18n';
import { StewardService } from '../services/steward-service';

export class DocumentViewModal extends Modal {
	private query = '';
	private unsubscribe: (() => void) | null = null;
	private resultsEl: HTMLElement | null = null;
	private countEl: HTMLElement | null = null;

	constructor(
		app: App,
		private readonly service: StewardService,
		private readonly didClose: () => void = () => undefined,
	) {
		super(app);
	}

	onOpen(): void {
		this.query = '';
		this.modalEl.addClass('note-steward-modal');
		this.contentEl.addClass('note-steward-document-view');
		this.unsubscribe = this.service.onChange(() => this.renderResults());
		this.renderShell();
	}

	onClose(): void {
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.contentEl.empty();
		this.didClose();
	}

	private renderShell(): void {
		const t = translations(this.service.persistedData.settings.locale);
		this.setTitle(t.documentViewTitle);
		this.contentEl.empty();

		const controls = this.contentEl.createDiv({
			cls: 'note-steward-modal-controls',
		});
		const search = controls.createEl('input', {
			type: 'search',
			placeholder: t.searchDocuments,
			attr: { 'aria-label': t.searchDocuments },
		});
		search.value = this.query;
		search.addEventListener('input', () => {
			this.query = search.value;
			this.renderResults();
		});
		this.countEl = controls.createSpan({ cls: 'note-steward-muted' });
		this.resultsEl = this.contentEl.createDiv({
			cls: 'note-steward-modal-results note-steward-document-tree',
		});
		this.renderResults();
		search.focus();
	}

	private renderResults(): void {
		if (!this.resultsEl || !this.countEl) return;
		const t = translations(this.service.persistedData.settings.locale);
		const documents = filterDocumentTree(
			this.service.getDocumentTreeItems(),
			this.query,
		);
		this.countEl.setText(t.documentCount(documents.length));
		this.resultsEl.empty();
		if (documents.length === 0) {
			this.resultsEl.createDiv({
				cls: 'note-steward-empty',
				text: t.noDocuments,
			});
			return;
		}

		for (const document of documents) {
			const group = this.resultsEl.createDiv({
				cls: 'note-steward-tree-group',
			});
			const documentButton = group.createEl('button', {
				cls: 'note-steward-tree-document',
				text: document.path,
			});
			documentButton.addEventListener('click', () =>
				this.openFile(document.path),
			);
			document.attachments.forEach((attachment, index) => {
				const row = group.createDiv({
					cls: 'note-steward-tree-attachment',
				});
				row.createSpan({
					cls: 'note-steward-tree-branch',
					text:
						index === document.attachments.length - 1
							? '└──'
							: '├──',
				});
				const attachmentButton = row.createEl('button', {
					text: attachment.name,
					attr: { title: attachment.path },
				});
				attachmentButton.addEventListener('click', () =>
					this.openFile(attachment.path),
				);
			});
		}
	}

	private openFile(path: string): void {
		const file = this.service.getFile(path);
		if (!(file instanceof TFile)) return;
		this.close();
		void this.app.workspace.getLeaf(false).openFile(file);
	}
}
