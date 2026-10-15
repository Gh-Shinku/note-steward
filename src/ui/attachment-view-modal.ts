import { App, Modal, Notice, TFile } from 'obsidian';
import { filterAndSortAttachments } from '../core/model';
import { Translation, translations } from '../i18n';
import { StewardService } from '../services/steward-service';
import {
	AttachmentSort,
	AttachmentViewFilter,
	OwnershipFilter,
	ReferenceFilter,
	ReviewItem,
} from '../types';
import { ConfirmDeleteModal, formatBytes } from './confirm-delete-modal';

const DEFAULT_FILTER: AttachmentViewFilter = {
	query: '',
	reference: 'all',
	ownership: 'all',
	extension: '',
	sort: 'references-asc',
};

export class AttachmentViewModal extends Modal {
	private filter: AttachmentViewFilter = { ...DEFAULT_FILTER };
	private readonly selected = new Set<string>();
	private unsubscribe: (() => void) | null = null;

	constructor(
		app: App,
		private readonly service: StewardService,
		private readonly didClose: () => void = () => undefined,
	) {
		super(app);
	}

	onOpen(): void {
		this.filter = { ...DEFAULT_FILTER };
		this.selected.clear();
		this.modalEl.addClass('note-steward-modal');
		this.contentEl.addClass('note-steward-attachment-view');
		this.unsubscribe = this.service.onChange(() => this.render());
		this.render();
	}

	onClose(): void {
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.contentEl.empty();
		this.didClose();
	}

	private render(): void {
		const t = translations(this.service.persistedData.settings.locale);
		const allItems = this.service.getReviewItems();
		const validIds = new Set(
			allItems
				.filter((item) => item.totalReferences === 0)
				.map((item) => item.id),
		);
		for (const id of this.selected) {
			if (!validIds.has(id)) this.selected.delete(id);
		}

		this.setTitle(t.attachmentViewTitle);
		this.contentEl.empty();
		const controls = this.contentEl.createDiv({
			cls: 'note-steward-modal-controls note-steward-attachment-controls',
		});
		this.renderFilters(controls, allItems, t);

		const items = filterAndSortAttachments(allItems, this.filter);
		this.renderSelectionBar(this.contentEl, items, allItems, t);
		const results = this.contentEl.createDiv({
			cls: 'note-steward-modal-results note-steward-attachment-list',
		});
		if (items.length === 0) {
			results.createDiv({
				cls: 'note-steward-empty',
				text: t.noAttachments,
			});
			return;
		}
		for (const item of items) this.renderItem(results, item, t);
	}

	private renderFilters(
		container: HTMLElement,
		allItems: ReviewItem[],
		t: Translation,
	): void {
		const search = container.createEl('input', {
			type: 'search',
			placeholder: t.searchAttachments,
			attr: { 'aria-label': t.searchAttachments },
		});
		search.value = this.filter.query;
		search.addEventListener('input', () => {
			this.filter.query = search.value;
			this.selected.clear();
			this.render();
			this.focusSearch();
		});

		const reference = container.createEl('select', {
			attr: { 'aria-label': t.referenceFilter },
		});
		const referenceOptions: Array<[ReferenceFilter, string]> = [
			['all', t.all],
			['zero', t.zeroReferences],
			['referenced', t.referenced],
			['shared', t.shared],
		];
		for (const option of referenceOptions) addOption(reference, ...option);
		reference.value = this.filter.reference;
		reference.addEventListener('change', () => {
			this.filter.reference = reference.value as ReferenceFilter;
			this.selected.clear();
			this.render();
		});

		const ownership = container.createEl('select', {
			attr: { 'aria-label': t.ownershipFilter },
		});
		const ownershipOptions: Array<[OwnershipFilter, string]> = [
			['all', t.all],
			['owned', t.owned],
			['unclaimed', t.unclaimed],
			['owner-missing', t.ownerMissing],
			['needs-repair', t.needsRepair],
		];
		for (const option of ownershipOptions) addOption(ownership, ...option);
		ownership.value = this.filter.ownership;
		ownership.addEventListener('change', () => {
			this.filter.ownership = ownership.value as OwnershipFilter;
			this.selected.clear();
			this.render();
		});

		const type = container.createEl('select', {
			attr: { 'aria-label': t.fileType },
		});
		addOption(type, '', t.all);
		for (const extension of [
			...new Set(allItems.map((item) => item.extension)),
		].sort()) {
			addOption(type, extension, extension.toLocaleUpperCase());
		}
		type.value = this.filter.extension;
		type.addEventListener('change', () => {
			this.filter.extension = type.value;
			this.selected.clear();
			this.render();
		});

		const sort = container.createEl('select', {
			attr: { 'aria-label': t.sort },
		});
		const sortOptions: Array<[AttachmentSort, string]> = [
			['references-asc', t.sortReferencesAscending],
			['references-desc', t.sortReferencesDescending],
			['name-asc', t.sortNameAscending],
			['path-asc', t.sortPathAscending],
		];
		for (const option of sortOptions) addOption(sort, ...option);
		sort.value = this.filter.sort;
		sort.addEventListener('change', () => {
			this.filter.sort = sort.value as AttachmentSort;
			this.render();
		});
	}

	private renderSelectionBar(
		container: HTMLElement,
		items: ReviewItem[],
		allItems: ReviewItem[],
		t: Translation,
	): void {
		const bar = container.createDiv({ cls: 'note-steward-selection-bar' });
		bar.createSpan({
			cls: 'note-steward-muted',
			text: `${t.attachmentCount(items.length)} · ${t.selected(this.selected.size)}`,
		});
		const actions = bar.createDiv({
			cls: 'note-steward-selection-actions',
		});
		const selectVisible = actions.createEl('button', {
			text: t.selectVisible,
		});
		selectVisible.disabled = !items.some(
			(item) => item.totalReferences === 0,
		);
		selectVisible.addEventListener('click', () => {
			for (const item of items) {
				if (item.totalReferences === 0) this.selected.add(item.id);
			}
			this.render();
		});
		const clear = actions.createEl('button', { text: t.clearSelection });
		clear.disabled = this.selected.size === 0;
		clear.addEventListener('click', () => {
			this.selected.clear();
			this.render();
		});
		const remove = actions.createEl('button', {
			text: t.deleteSelected,
			cls: 'mod-warning',
		});
		remove.disabled = this.selected.size === 0;
		remove.addEventListener('click', () => {
			const selectedItems = allItems.filter((item) =>
				this.selected.has(item.id),
			);
			this.confirmDeletion(selectedItems, t);
		});
	}

	private renderItem(
		container: HTMLElement,
		item: ReviewItem,
		t: Translation,
	): void {
		const row = container.createDiv({ cls: 'note-steward-attachment-row' });
		const checkbox = row.createEl('input', {
			type: 'checkbox',
			attr: { 'aria-label': item.name },
		});
		checkbox.checked = this.selected.has(item.id);
		checkbox.disabled = item.totalReferences !== 0;
		checkbox.addEventListener('change', () => {
			if (checkbox.checked) this.selected.add(item.id);
			else this.selected.delete(item.id);
			this.render();
		});

		const content = row.createDiv({
			cls: 'note-steward-attachment-content',
		});
		const heading = content.createDiv({
			cls: 'note-steward-attachment-heading',
		});
		const name = heading.createEl('button', {
			cls: 'note-steward-link-button',
			text: item.name,
		});
		name.addEventListener('click', () => this.openFile(item.path));
		heading.createSpan({
			cls: `note-steward-badge is-${item.ownershipState}`,
			text: ownershipLabel(item, t),
		});
		content.createDiv({ cls: 'note-steward-path', text: item.path });
		content.createDiv({
			cls: 'note-steward-meta',
			text: `${formatBytes(item.size)} · ${t.references}: ${item.totalReferences} · ${t.referenceDocuments}: ${item.references.length} · ${t.owner}: ${item.ownerPath ?? t.unknownOwner}`,
		});
		if (item.issue)
			content.createDiv({ cls: 'note-steward-issue', text: item.issue });
		if (item.references.length > 0) {
			const sources = content.createDiv({
				cls: 'note-steward-reference-list',
			});
			for (const reference of item.references) {
				const source = sources.createEl('button', {
					cls: 'note-steward-link-button',
					text: `${reference.path} × ${reference.count}`,
				});
				source.addEventListener('click', () =>
					this.openFile(reference.path),
				);
			}
		}
	}

	private confirmDeletion(items: ReviewItem[], t: Translation): void {
		const safeItems = items.filter((item) => item.totalReferences === 0);
		if (safeItems.length === 0) return;
		new ConfirmDeleteModal(this.app, t, {
			items: safeItems.map((item) => ({
				path: item.path,
				size: item.size,
				ownerPath: item.ownerPath,
			})),
			onConfirm: async () => {
				try {
					const result = await this.service.deleteAttachments(
						safeItems.map((item) => item.id),
					);
					this.selected.clear();
					new Notice(t.deletedCount(result.deleted));
					if (result.skipped > 0)
						new Notice(t.skippedCount(result.skipped));
				} catch (error) {
					console.error('Note Steward deletion failed', error);
					new Notice(t.operationFailed);
				}
			},
		}).open();
	}

	private openFile(path: string): void {
		const file = this.service.getFile(path);
		if (!(file instanceof TFile)) return;
		this.close();
		void this.app.workspace.getLeaf(false).openFile(file);
	}

	private focusSearch(): void {
		const input = this.contentEl.querySelector<HTMLInputElement>(
			'input[type="search"]',
		);
		if (!input) return;
		input.focus();
		input.setSelectionRange(input.value.length, input.value.length);
	}
}

function addOption(
	select: HTMLSelectElement,
	value: string,
	label: string,
): void {
	const option = select.createEl('option', { text: label });
	option.value = value;
}

function ownershipLabel(item: ReviewItem, t: Translation): string {
	switch (item.ownershipState) {
		case 'owned':
			return t.owned;
		case 'unclaimed':
			return t.unclaimed;
		case 'owner-missing':
			return t.ownerMissing;
		case 'needs-repair':
			return t.needsRepair;
	}
}
