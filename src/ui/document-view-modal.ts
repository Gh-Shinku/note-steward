import { App, Modal, setIcon, TFile } from 'obsidian';
import { filterDocumentTree } from '../core/model';
import { translations } from '../i18n';
import { StewardService } from '../services/steward-service';
import { DocumentTreeItem, ReviewItem } from '../types';
import { bindImeAwareSearch } from './search-input';
import { getVirtualRange } from './virtual-list';

const TREE_ROW_HEIGHT = 32;

type TreeRow =
	| { kind: 'document'; document: DocumentTreeItem; expanded: boolean }
	| { kind: 'attachment'; attachment: ReviewItem };

export class DocumentViewModal extends Modal {
	private query = '';
	private unsubscribe: (() => void) | null = null;
	private resultsEl: HTMLElement | null = null;
	private countEl: HTMLElement | null = null;
	private rows: TreeRow[] = [];
	private documents: DocumentTreeItem[] = [];
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
		this.unsubscribe = this.service.onChange(() =>
			this.refreshRows(false, true),
		);
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
		bindImeAwareSearch(search, (query) => {
			this.query = query;
			this.refreshRows(true, false);
		});
		this.countEl = controls.createSpan({ cls: 'note-steward-muted' });
		this.resultsEl = this.contentEl.createDiv({
			cls: 'note-steward-modal-results note-steward-document-tree',
		});
		this.resultsEl.setAttribute('role', 'tree');
		this.resultsEl.addEventListener('scroll', () => this.renderRows());
		this.refreshRows(true, true);
		search.focus();
	}

	private refreshRows(resetScroll = false, refreshItems = true): void {
		if (!this.resultsEl || !this.countEl) return;
		const t = translations(this.service.persistedData.settings.locale);
		if (refreshItems) this.documents = this.service.getDocumentTreeItems();
		const documents = filterDocumentTree(this.documents, this.query);
		this.countEl.setText(t.documentCount(documents.length));
		this.rows = [];
		for (const document of documents) {
			const expanded =
				Boolean(this.query.trim()) ||
				!this.collapsedDocuments.has(document.documentId);
			this.rows.push({ kind: 'document', document, expanded });
			if (expanded) {
				for (const attachment of document.attachments)
					this.rows.push({ kind: 'attachment', attachment });
			}
		}
		if (resetScroll) this.resultsEl.scrollTop = 0;
		this.renderRows();
	}

	private renderRows(): void {
		if (!this.resultsEl) return;
		const t = translations(this.service.persistedData.settings.locale);
		if (this.rows.length === 0) {
			this.resultsEl.empty();
			this.resultsEl.createDiv({
				cls: 'note-steward-empty',
				text: t.noDocuments,
			});
			return;
		}
		const scrollTop = this.resultsEl.scrollTop;
		const range = getVirtualRange(
			this.rows.length,
			scrollTop,
			this.resultsEl.clientHeight,
			TREE_ROW_HEIGHT,
		);
		this.resultsEl.empty();
		this.createSpacer(range.paddingBefore);
		for (const row of this.rows.slice(range.start, range.end)) {
			if (row.kind === 'document') this.renderDocumentRow(row, t);
			else this.renderAttachmentRow(row.attachment);
		}
		this.createSpacer(range.paddingAfter);
		this.resultsEl.scrollTop = scrollTop;
	}

	private renderDocumentRow(
		row: Extract<TreeRow, { kind: 'document' }>,
		t: ReturnType<typeof translations>,
	): void {
		if (!this.resultsEl) return;
		const container = this.resultsEl.createDiv({
			cls: 'note-steward-tree-row note-steward-tree-group note-steward-tree-document-row',
		});
		container.setAttribute('role', 'treeitem');
		container.setAttribute('aria-level', '1');
		container.setAttribute('aria-expanded', String(row.expanded));
		const toggle = container.createEl('button', {
			cls: 'note-steward-tree-toggle',
			attr: {
				'aria-label': row.expanded ? t.collapse : t.expand,
				title: row.expanded ? t.collapse : t.expand,
			},
		});
		setIcon(toggle, row.expanded ? 'chevron-down' : 'chevron-right');
		toggle.addEventListener('click', () => {
			if (row.expanded)
				this.collapsedDocuments.add(row.document.documentId);
			else this.collapsedDocuments.delete(row.document.documentId);
			this.refreshRows(false, false);
		});
		const documentButton = this.createTreeLabel(
			container,
			'document',
			row.document.path,
			row.document.path,
		);
		documentButton.addEventListener('click', () =>
			this.openFile(row.document.path),
		);
	}

	private renderAttachmentRow(attachment: ReviewItem): void {
		if (!this.resultsEl) return;
		const row = this.resultsEl.createDiv({
			cls: 'note-steward-tree-row note-steward-tree-attachment',
		});
		row.setAttribute('role', 'treeitem');
		row.setAttribute('aria-level', '2');
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

	private createSpacer(height: number): void {
		if (!this.resultsEl || height <= 0) return;
		const spacer = this.resultsEl.createDiv({
			cls: 'note-steward-virtual-spacer',
		});
		spacer.style.height = `${height}px`;
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
