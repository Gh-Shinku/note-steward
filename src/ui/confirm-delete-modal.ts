import { App, ButtonComponent, Modal } from 'obsidian';
import { Translation } from '../i18n';

interface ConfirmDeleteOptions {
	items: Array<{
		path: string;
		size: number;
		ownerPath: string | null;
	}>;
	onConfirm: () => Promise<void>;
}

export class ConfirmDeleteModal extends Modal {
	constructor(
		app: App,
		private readonly t: Translation,
		private readonly options: ConfirmDeleteOptions,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		const totalSize = this.options.items.reduce(
			(total, item) => total + item.size,
			0,
		);
		contentEl.addClass('note-steward-confirm');
		contentEl.createEl('h2', { text: this.t.confirmDelete });
		contentEl.createEl('p', {
			text:
				this.options.items.length === 1
					? this.t.confirmSingle
					: this.t.confirmBulk,
		});
		contentEl.createEl('p', {
			cls: 'note-steward-muted',
			text: `${this.options.items.length} · ${formatBytes(totalSize)}`,
		});
		const singleItem = this.options.items[0];
		if (this.options.items.length === 1 && singleItem) {
			contentEl.createEl('p', {
				text: `${this.t.owner}: ${singleItem.ownerPath ?? this.t.unknownOwner}`,
			});
		}

		const pathList = contentEl.createEl('ul', {
			cls: 'note-steward-confirm-paths',
		});
		for (const item of this.options.items.slice(0, 50)) {
			pathList.createEl('li', {
				text: `${item.path} · ${formatBytes(item.size)}`,
			});
		}
		if (this.options.items.length > 50) {
			pathList.createEl('li', {
				text: `… +${this.options.items.length - 50}`,
			});
		}

		let accepted = this.options.items.length === 1;
		let confirmButton: ButtonComponent;
		if (this.options.items.length > 1) {
			const label = contentEl.createEl('label', {
				cls: 'note-steward-confirm-check',
			});
			const checkbox = label.createEl('input', { type: 'checkbox' });
			label.createSpan({ text: this.t.confirmCheck });
			checkbox.addEventListener('change', () => {
				accepted = checkbox.checked;
				confirmButton.setDisabled(!accepted);
			});
		}

		const buttons = contentEl.createDiv({
			cls: 'note-steward-modal-actions',
		});
		new ButtonComponent(buttons)
			.setButtonText(this.t.cancel)
			.onClick(() => this.close());
		confirmButton = new ButtonComponent(buttons)
			.setButtonText(this.t.confirm)
			.setCta()
			.setDisabled(!accepted)
			.onClick(() => {
				if (!accepted) return;
				this.close();
				void this.options.onConfirm();
			});
		confirmButton.buttonEl.addClass('mod-warning');
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export function formatBytes(value: number): string {
	if (value < 1024) return `${value} B`;
	if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
	if (value < 1024 * 1024 * 1024)
		return `${(value / 1024 / 1024).toFixed(1)} MB`;
	return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
