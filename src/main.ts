import { Modal, Notice, Plugin } from 'obsidian';
import { translations } from './i18n';
import { StewardService } from './services/steward-service';
import { NoteStewardSettingTab } from './settings';
import { NoteStewardData } from './types';
import { AttachmentViewModal } from './ui/attachment-view-modal';
import { DocumentViewModal } from './ui/document-view-modal';

export default class NoteStewardPlugin extends Plugin {
	private service!: StewardService;
	private readonly openModals = new Set<Modal>();

	async onload(): Promise<void> {
		this.app.workspace.onLayoutReady(() => {
			// Obsidian restores saved leaves after plugins start loading.
			this.app.workspace.detachLeavesOfType('note-steward-review');
		});
		const loadedData: unknown = await this.loadData();
		this.service = new StewardService(
			this.app,
			loadedData,
			async (data: NoteStewardData) => {
				await this.saveData(data);
			},
		);
		this.service.register(this);

		this.addSettingTab(
			new NoteStewardSettingTab(this.app, this, this.service),
		);

		const t = translations(this.service.persistedData.settings.locale);
		this.addCommand({
			id: 'open-document-view',
			name: t.openDocumentView,
			callback: () =>
				this.openModal(
					(onClose) =>
						new DocumentViewModal(this.app, this.service, onClose),
				),
		});
		this.addCommand({
			id: 'open-attachment-view',
			name: t.openAttachmentView,
			callback: () =>
				this.openModal(
					(onClose) =>
						new AttachmentViewModal(
							this.app,
							this.service,
							onClose,
						),
				),
		});
		this.addCommand({
			id: 'rebuild-index',
			name: t.rebuildIndex,
			callback: () => {
				void this.service
					.rebuildIndex()
					.then(() => new Notice(t.rebuildDone))
					.catch((error: unknown) => this.reportError(error));
			},
		});
	}

	onunload(): void {
		for (const modal of this.openModals) modal.close();
		this.openModals.clear();
	}

	private openModal(factory: (onClose: () => void) => Modal): void {
		let modal: Modal;
		modal = factory(() => this.openModals.delete(modal));
		this.openModals.add(modal);
		modal.open();
	}

	private reportError(error: unknown): void {
		console.error('Note Steward operation failed', error);
		new Notice(
			translations(this.service.persistedData.settings.locale)
				.operationFailed,
		);
	}
}
