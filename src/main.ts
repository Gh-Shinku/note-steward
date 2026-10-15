import { Notice, Plugin, TFile, WorkspaceLeaf } from 'obsidian';
import { translations } from './i18n';
import { StewardService } from './services/steward-service';
import { NoteStewardSettingTab } from './settings';
import { NoteStewardData } from './types';
import { REVIEW_VIEW_TYPE, ReviewView } from './ui/review-view';

export default class NoteStewardPlugin extends Plugin {
	private service!: StewardService;

	async onload(): Promise<void> {
		const loadedData: unknown = await this.loadData();
		this.service = new StewardService(
			this.app,
			loadedData,
			async (data: NoteStewardData) => {
				await this.saveData(data);
			},
		);
		this.service.register(this);

		this.registerView(
			REVIEW_VIEW_TYPE,
			(leaf) => new ReviewView(leaf, this.service),
		);
		this.addSettingTab(
			new NoteStewardSettingTab(this.app, this, this.service),
		);

		const t = translations(this.service.persistedData.settings.locale);
		this.addRibbonIcon('archive-restore', t.openReview, () => {
			void this.openReview();
		});

		this.addCommand({
			id: 'open-attachment-review',
			name: t.openReview,
			callback: () => void this.openReview(),
		});
		this.addCommand({
			id: 'review-current-note-attachments',
			name: t.reviewCurrent,
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== 'md') return false;
				if (!checking) void this.openReview(file.path);
				return true;
			},
		});
		this.addCommand({
			id: 'repair-index',
			name: t.repairIndex,
			callback: () => {
				void this.service
					.repairIndex()
					.then(() => new Notice(t.repairDone))
					.catch((error: unknown) => this.reportError(error));
			},
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

		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (!(file instanceof TFile) || file.extension !== 'md') return;
				menu.addItem((item) =>
					item
						.setTitle(t.viewOwned)
						.setIcon('archive-restore')
						.onClick(() => void this.openReview(file.path)),
				);
			}),
		);
	}

	onunload(): void {}

	private async openReview(ownerPath: string | null = null): Promise<void> {
		let leaf: WorkspaceLeaf | undefined =
			this.app.workspace.getLeavesOfType(REVIEW_VIEW_TYPE)[0];
		if (!leaf) {
			leaf =
				this.app.workspace.getRightLeaf(false) ??
				this.app.workspace.getLeaf(true);
			await leaf.setViewState({ type: REVIEW_VIEW_TYPE, active: true });
		}
		this.app.workspace.setActiveLeaf(leaf, { focus: true });
		if (leaf.view instanceof ReviewView)
			leaf.view.setOwnerFilter(ownerPath);
	}

	private reportError(error: unknown): void {
		console.error('Note Steward operation failed', error);
		new Notice(
			translations(this.service.persistedData.settings.locale)
				.operationFailed,
		);
	}
}
