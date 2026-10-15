import { ItemView, Notice, TFile, WorkspaceLeaf, setIcon } from 'obsidian';
import { filterReviewItems } from '../core/model';
import { Translation, translations } from '../i18n';
import { StewardService } from '../services/steward-service';
import { ReviewFilter, ReviewItem, ReviewScope, ReviewStatus } from '../types';
import { ConfirmDeleteModal, formatBytes } from './confirm-delete-modal';

export const REVIEW_VIEW_TYPE = 'note-steward-review';

const IMAGE_EXTENSIONS = new Set([
	'avif',
	'bmp',
	'gif',
	'jpeg',
	'jpg',
	'png',
	'svg',
	'webp',
]);
const AUDIO_EXTENSIONS = new Set(['flac', 'm4a', 'mp3', 'ogg', 'wav']);
const VIDEO_EXTENSIONS = new Set(['mkv', 'mov', 'mp4', 'ogv', 'webm']);

export class ReviewView extends ItemView {
	private unsubscribe: (() => void) | null = null;
	private filter: ReviewFilter = {
		query: '',
		status: 'all',
		extension: '',
		scope: 'vault',
		currentNotePath: null,
		folderPath: '',
		ownerPath: null,
	};

	constructor(
		leaf: WorkspaceLeaf,
		private readonly service: StewardService,
	) {
		super(leaf);
	}

	getViewType(): string {
		return REVIEW_VIEW_TYPE;
	}

	getDisplayText(): string {
		return translations(this.service.persistedData.settings.locale)
			.reviewTitle;
	}

	getIcon(): string {
		return 'archive-restore';
	}

	async onOpen(): Promise<void> {
		this.unsubscribe = this.service.onChange(() => this.render());
		this.render();
	}

	async onClose(): Promise<void> {
		this.unsubscribe?.();
		this.unsubscribe = null;
	}

	setOwnerFilter(ownerPath: string | null): void {
		this.filter.ownerPath = ownerPath;
		this.filter.scope = ownerPath ? 'vault' : this.filter.scope;
		this.render();
	}

	private render(): void {
		const t = translations(this.service.persistedData.settings.locale);
		const activeFile = this.app.workspace.getActiveFile();
		this.filter.currentNotePath =
			activeFile?.extension === 'md' ? activeFile.path : null;
		const allItems = this.service.getReviewItems();
		const items = filterReviewItems(allItems, this.filter);
		const content = this.contentEl;
		content.empty();
		content.addClass('note-steward-review');

		const header = content.createDiv({ cls: 'note-steward-header' });
		const title = header.createDiv();
		title.createEl('h2', { text: t.reviewTitle });
		title.createSpan({
			cls: 'note-steward-muted',
			text: t.indexed(allItems.length),
		});
		const actions = header.createDiv({ cls: 'note-steward-actions' });
		this.createAction(actions, 'refresh-cw', t.refresh, () =>
			this.render(),
		);
		this.createAsyncAction(actions, 'wrench', t.repairIndex, async () => {
			await this.service.repairIndex();
			new Notice(t.repairDone);
		});
		this.createAsyncAction(
			actions,
			'database-zap',
			t.rebuildIndex,
			async () => {
				await this.service.rebuildIndex();
				new Notice(t.rebuildDone);
			},
		);

		this.renderFilters(content, allItems, t);

		const zeroReferenceItems = items.filter(
			(item) => item.totalReferences === 0,
		);
		const bulk = content.createDiv({ cls: 'note-steward-bulk' });
		const bulkButton = bulk.createEl('button', {
			text: `${t.deleteVisible} (${zeroReferenceItems.length})`,
			cls: 'mod-warning',
		});
		bulkButton.disabled = zeroReferenceItems.length === 0;
		bulkButton.addEventListener('click', () =>
			this.confirmDeletion(zeroReferenceItems, t),
		);

		if (items.length === 0) {
			content.createDiv({
				cls: 'note-steward-empty',
				text: t.noAttachments,
			});
			return;
		}

		const list = content.createDiv({ cls: 'note-steward-list' });
		for (const item of items) this.renderItem(list, item, t);
	}

	private renderFilters(
		container: HTMLElement,
		allItems: ReviewItem[],
		t: Translation,
	): void {
		const filters = container.createDiv({ cls: 'note-steward-filters' });
		const search = filters.createEl('input', {
			type: 'search',
			placeholder: t.search,
		});
		search.value = this.filter.query;
		search.addEventListener('input', () => {
			this.filter.query = search.value;
			this.render();
		});

		const status = filters.createEl('select', {
			attr: { 'aria-label': t.status },
		});
		const statuses: Array<[ReviewStatus, string]> = [
			['all', t.all],
			['orphaned', t.orphaned],
			['shared', t.shared],
			['unclaimed', t.unclaimed],
			['owner-missing', t.ownerMissing],
			['needs-repair', t.needsRepair],
		];
		for (const [value, label] of statuses) addOption(status, value, label);
		status.value = this.filter.status;
		status.addEventListener('change', () => {
			this.filter.status = status.value as ReviewStatus;
			this.render();
		});

		const scope = filters.createEl('select', {
			attr: { 'aria-label': t.scope },
		});
		const scopes: Array<[ReviewScope, string]> = [
			['vault', t.vault],
			['current-note', t.currentNote],
			['folder', t.folder],
		];
		for (const [value, label] of scopes) addOption(scope, value, label);
		scope.value = this.filter.scope;
		scope.addEventListener('change', () => {
			this.filter.scope = scope.value as ReviewScope;
			this.filter.ownerPath = null;
			this.render();
		});

		const folder = filters.createEl('select', {
			attr: { 'aria-label': t.folder },
		});
		for (const path of this.service.getFolderPaths())
			addOption(folder, path, path || '/');
		folder.value = this.filter.folderPath;
		folder.disabled = this.filter.scope !== 'folder';
		folder.addEventListener('change', () => {
			this.filter.folderPath = folder.value;
			this.render();
		});

		const type = filters.createEl('select', {
			attr: { 'aria-label': t.type },
		});
		addOption(type, '', t.all);
		const extensions = [
			...new Set(allItems.map((item) => item.extension)),
		].sort();
		for (const extension of extensions)
			addOption(type, extension, extension.toLocaleUpperCase());
		type.value = this.filter.extension;
		type.addEventListener('change', () => {
			this.filter.extension = type.value;
			this.render();
		});
	}

	private renderItem(
		container: HTMLElement,
		item: ReviewItem,
		t: Translation,
	): void {
		const card = container.createDiv({ cls: 'note-steward-card' });
		this.renderPreview(
			card.createDiv({ cls: 'note-steward-preview' }),
			item,
		);
		const body = card.createDiv({ cls: 'note-steward-card-body' });
		const titleRow = body.createDiv({ cls: 'note-steward-card-title' });
		const titleButton = titleRow.createEl('button', {
			cls: 'clickable-icon note-steward-name',
			text: item.name,
		});
		titleButton.addEventListener('click', () => this.openFile(item.path));
		titleRow.createSpan({
			cls: `note-steward-badge is-${item.ownershipState}`,
			text: statusLabel(item, t),
		});

		body.createDiv({ cls: 'note-steward-path', text: item.path });
		body.createDiv({
			cls: 'note-steward-meta',
			text: `${formatBytes(item.size)} · ${t.references}: ${item.totalReferences} · ${t.owner}: ${item.ownerPath ?? t.unknownOwner}`,
		});
		if (item.issue)
			body.createDiv({ cls: 'note-steward-issue', text: item.issue });

		const details = body.createEl('details');
		details.createEl('summary', {
			text: `${t.references} (${item.references.length})`,
		});
		const sources = details.createDiv({ cls: 'note-steward-sources' });
		for (const reference of item.references) {
			const source = sources.createEl('button', {
				text: `${reference.path} × ${reference.count}`,
			});
			source.addEventListener('click', () =>
				this.openFile(reference.path),
			);
		}

		const footer = body.createDiv({ cls: 'note-steward-card-actions' });
		const openButton = footer.createEl('button', { text: t.open });
		openButton.addEventListener('click', () => this.openFile(item.path));
		if (item.ownershipState !== 'owned')
			this.renderOwnerPicker(footer, item, t);
		const deleteButton = footer.createEl('button', {
			text: t.delete,
			cls: 'mod-warning',
		});
		deleteButton.disabled = item.totalReferences !== 0;
		deleteButton.addEventListener('click', () =>
			this.confirmDeletion([item], t),
		);
	}

	private renderOwnerPicker(
		container: HTMLElement,
		item: ReviewItem,
		t: Translation,
	): void {
		const select = container.createEl('select', {
			attr: { 'aria-label': t.claim },
		});
		addOption(select, '', t.claim);
		for (const note of this.service.getMarkdownFiles())
			addOption(select, note.path, note.path);
		select.addEventListener('change', () => {
			if (!select.value) return;
			void this.service
				.assignOwner(item.id, select.value)
				.catch((error: unknown) => {
					console.error(
						'Note Steward could not assign the owner',
						error,
					);
					new Notice(t.operationFailed);
				});
		});
	}

	private renderPreview(container: HTMLElement, item: ReviewItem): void {
		const file = this.service.getFile(item.path);
		if (!file) return;
		const source = this.app.vault.getResourcePath(file);
		if (IMAGE_EXTENSIONS.has(item.extension)) {
			container.createEl('img', {
				attr: { src: source, alt: item.name },
			});
			return;
		}
		if (AUDIO_EXTENSIONS.has(item.extension)) {
			container.createEl('audio', {
				attr: { src: source, controls: 'true' },
			});
			return;
		}
		if (VIDEO_EXTENSIONS.has(item.extension)) {
			container.createEl('video', {
				attr: { src: source, controls: 'true' },
			});
			return;
		}
		if (item.extension === 'pdf') {
			container.createEl('iframe', {
				attr: { src: source, title: item.name },
			});
			return;
		}
		const icon = container.createDiv({ cls: 'note-steward-file-icon' });
		setIcon(icon, 'file');
		icon.createSpan({
			text: item.extension.toLocaleUpperCase() || '?',
		});
	}

	private openFile(path: string): void {
		const file = this.service.getFile(path);
		if (file instanceof TFile)
			void this.app.workspace.getLeaf(false).openFile(file);
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

	private createAction(
		container: HTMLElement,
		iconName: string,
		label: string,
		onClick: () => void,
	): void {
		const button = container.createEl('button', {
			cls: 'clickable-icon',
			attr: { 'aria-label': label },
		});
		setIcon(button, iconName);
		button.addEventListener('click', onClick);
	}

	private createAsyncAction(
		container: HTMLElement,
		iconName: string,
		label: string,
		onClick: () => Promise<void>,
	): void {
		this.createAction(container, iconName, label, () => {
			void onClick().catch((error: unknown) => {
				console.error(`Note Steward action failed: ${label}`, error);
				new Notice(
					translations(this.service.persistedData.settings.locale)
						.operationFailed,
				);
			});
		});
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

function statusLabel(item: ReviewItem, t: Translation): string {
	if (item.ownershipState === 'unclaimed') return t.unclaimed;
	if (item.ownershipState === 'owner-missing') return t.ownerMissing;
	if (item.ownershipState === 'needs-repair') return t.needsRepair;
	if (item.totalReferences === 0) return t.orphaned;
	if (item.references.length > 1) return t.shared;
	return t.owner;
}
