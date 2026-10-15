export class TAbstractFile {
	path = '';
	name = '';
	parent = null;
}

export class TFile extends TAbstractFile {
	stat = { ctime: 0, mtime: 0, size: 0 };
	basename = '';
	extension = '';
}

export class TFolder extends TAbstractFile {
	children: TAbstractFile[] = [];

	isRoot(): boolean {
		return this.path === '';
	}
}

export class Modal {
	modalEl: HTMLElement;
	contentEl: HTMLElement;
	titleEl: HTMLElement;

	constructor(public app: unknown) {
		this.modalEl = createNativeElement('div');
		this.modalEl.className = 'modal';
		this.titleEl = createNativeElement('div');
		this.titleEl.className = 'modal-title';
		this.contentEl = createNativeElement('div');
		this.contentEl.className = 'modal-content';
		this.modalEl.append(this.titleEl, this.contentEl);
	}

	open(): void {
		document.body.append(this.modalEl);
		(this as { onOpen?: () => void }).onOpen?.();
	}

	close(): void {
		(this as { onClose?: () => void }).onClose?.();
		this.modalEl.remove();
	}

	setTitle(title: string): this {
		this.titleEl.textContent = title;
		return this;
	}
}

export class ButtonComponent {
	buttonEl: HTMLButtonElement;

	constructor(container: HTMLElement) {
		this.buttonEl = createNativeElement('button');
		container.append(this.buttonEl);
	}

	setButtonText(value: string): this {
		this.buttonEl.textContent = value;
		return this;
	}

	setCta(): this {
		return this;
	}

	setDisabled(value: boolean): this {
		this.buttonEl.disabled = value;
		return this;
	}

	onClick(callback: () => void): this {
		this.buttonEl.addEventListener('click', callback);
		return this;
	}
}

export class Notice {
	constructor(public message: string) {}
}

export const moment = {
	locale: (): string => 'en',
};

export function setIcon(parent: HTMLElement, iconId: string): void {
	parent.dataset.icon = iconId;
}

function createNativeElement<K extends keyof HTMLElementTagNameMap>(
	tag: K,
): HTMLElementTagNameMap[K] {
	return document.createElementNS(
		'http://www.w3.org/1999/xhtml',
		tag,
	) as HTMLElementTagNameMap[K];
}

export function normalizePath(path: string): string {
	return path
		.replaceAll('\\', '/')
		.replaceAll(/\/{2,}/g, '/')
		.replace(/^\//, '');
}
