import { App, Modal, setIcon, TFile } from 'obsidian';
import { filterDocumentTree } from '../core/model';
import { translations } from '../i18n';
import { StewardService } from '../services/steward-service';

export class DocumentViewModal extends Modal {
	private query = '';
	private unsubscribe: (() => void) | null = null;
	private resultsEl: HTMLElement | null = null;
	private countEl: HTMLElement | null = null;
	private readonly collapsedDocuments = new Set<string>();

	constructor(
		app: App,
		private readonly service: StewardService,
		private readonly didClose: () => void = () => undefined,
	) {
		super(app);
	}

	onOpen(): void {
		this.query = '';
		this.collapsedDocuments.clear();
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
		this.resultsEl.setAttribute('role', 'tree');
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
			const expanded =
				Boolean(this.query.trim()) ||
				!this.collapsedDocuments.has(document.documentId);
			const group = this.resultsEl.createDiv({
				cls: 'note-steward-tree-group',
			});
			group.setAttribute('role', 'treeitem');
			group.setAttribute('aria-expanded', String(expanded));

			const documentRow = group.createDiv({
				cls: 'note-steward-tree-row note-steward-tree-document-row',
			});
			const toggle = documentRow.createEl('button', {
				cls: 'note-steward-tree-toggle',
				attr: {
					'aria-label': expanded ? t.collapse : t.expand,
					title: expanded ? t.collapse : t.expand,
				},
			});
			setIcon(toggle, expanded ? 'chevron-down' : 'chevron-right');
			toggle.addEventListener('click', () => {
				if (expanded) this.collapsedDocuments.add(document.documentId);
				else this.collapsedDocuments.delete(document.documentId);
				this.renderResults();
			});

			const documentButton = this.createTreeLabel(
				documentRow,
				'document',
				document.path,
				document.path,
			);
			documentButton.addEventListener('click', () =>
				this.openFile(document.path),
			);

			if (!expanded) continue;
			const children = group.createDiv({
				cls: 'note-steward-tree-children',
			});
			children.setAttribute('role', 'group');
			for (const attachment of document.attachments) {
				const row = children.createDiv({
					cls: 'note-steward-tree-row note-steward-tree-attachment',
				});
				row.setAttribute('role', 'treeitem');
				const attachmentButton = this.createTreeLabel(
					row,
					'attachment',
					attachment.name,
					attachment.path,
				);
				attachmentButton.addEventListener('click', () =>
					this.openFile(attachment.path),
				);
			}
		}
	}

	private createTreeLabel(
		container: HTMLElement,
		kind: 'document' | 'attachment',
		text: string,
		title: string,
	): HTMLButtonElement {
		const kindClass =
			kind === 'document'
				? 'note-steward-tree-document'
				: 'note-steward-tree-attachment-label';
		const button = container.createEl('button', {
			cls: `note-steward-tree-label ${kindClass}`,
			attr: { title },
		});
		const icon = button.createSpan({ cls: 'note-steward-tree-item-icon' });
		setIcon(icon, kind === 'document' ? 'file-text' : 'file');
		button.createSpan({
			cls: 'note-steward-tree-label-text',
			text,
		});
		return button;
	}

	private openFile(path: string): void {
		const file = this.service.getFile(path);
		if (!(file instanceof TFile)) return;
		this.close();
		void this.app.workspace.getLeaf(false).openFile(file);
	}
}
