import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import type { StewardService } from '../src/services/steward-service';
import type { DocumentTreeItem, ReviewItem } from '../src/types';
import { AttachmentViewModal } from '../src/ui/attachment-view-modal';
import { DocumentViewModal } from '../src/ui/document-view-modal';

beforeAll(() => installObsidianDomHelpers());

afterEach(() => {
	document.body.replaceChildren();
});

const orphan: ReviewItem = {
	id: 'orphan',
	path: 'assets/doc/image.png',
	name: 'image.png',
	extension: 'png',
	size: 128,
	ownerDocumentId: 'doc',
	ownerPath: 'Note.md',
	ownershipState: 'owned',
	totalReferences: 0,
	references: [],
};

const shared: ReviewItem = {
	id: 'shared',
	path: 'shared.pdf',
	name: 'shared.pdf',
	extension: 'pdf',
	size: 256,
	ownerDocumentId: null,
	ownerPath: null,
	ownershipState: 'unclaimed',
	totalReferences: 3,
	references: [
		{ path: 'A.md', count: 1 },
		{ path: 'B.md', count: 2 },
	],
};

function createContext() {
	const files = new Map<string, TFile>();
	for (const path of ['Note.md', orphan.path, shared.path, 'A.md', 'B.md']) {
		const file = new TFile();
		file.path = path;
		file.name = path.split('/').pop() ?? path;
		files.set(path, file);
	}
	const openFile = vi.fn(() => Promise.resolve());
	const deleteAttachments = vi.fn(() =>
		Promise.resolve({ deleted: 1, skipped: 0 }),
	);
	const tree: DocumentTreeItem[] = [
		{
			documentId: 'doc',
			path: 'Note.md',
			name: 'Note.md',
			attachments: [orphan],
		},
	];
	const service = {
		persistedData: { settings: { locale: 'en' } },
		getReviewItems: () => [orphan, shared],
		getDocumentTreeItems: () => tree,
		getFile: (path: string) => files.get(path) ?? null,
		onChange: () => () => undefined,
		deleteAttachments,
	} as unknown as StewardService;
	const app = {
		workspace: { getLeaf: () => ({ openFile }) },
	} as unknown as App;
	return { app, service, openFile, deleteAttachments };
}

describe('document view modal', () => {
	it('renders an expanded icon tree without ASCII branches or previews', () => {
		const { app, service } = createContext();
		new DocumentViewModal(app, service).open();

		expect(document.querySelector('.modal-title')?.textContent).toBe(
			'Documents and attachments',
		);
		expect(
			document.querySelector('.note-steward-document-tree')?.textContent,
		).toContain('Note.mdimage.png');
		expect(document.body.textContent).not.toContain('└──');
		expect(
			document.querySelector('[data-icon="chevron-down"]'),
		).not.toBeNull();
		expect(
			document.querySelector('[data-icon="file-text"]'),
		).not.toBeNull();
		expect(document.querySelector('[data-icon="file"]')).not.toBeNull();
		expect(document.querySelector('img, audio, video, iframe')).toBeNull();

		const search = document.querySelector<HTMLInputElement>(
			'input[type="search"]',
		);
		expect(search).not.toBeNull();
		if (!search) return;
		search.value = 'missing';
		search.dispatchEvent(new Event('input'));
		expect(document.body.textContent).toContain(
			'No documents match this search.',
		);
	});

	it('collapses documents and expands matches while searching', () => {
		const { app, service } = createContext();
		new DocumentViewModal(app, service).open();
		const toggle = document.querySelector<HTMLButtonElement>(
			'.note-steward-tree-toggle',
		);
		toggle?.click();
		expect(
			document.querySelector('.note-steward-tree-children'),
		).toBeNull();
		expect(
			document.querySelector('[aria-expanded="false"]'),
		).not.toBeNull();

		const search = document.querySelector<HTMLInputElement>(
			'input[type="search"]',
		);
		if (!search) return;
		search.value = 'image';
		search.dispatchEvent(new Event('input'));
		expect(document.body.textContent).toContain('image.png');
		expect(document.querySelector('[aria-expanded="true"]')).not.toBeNull();
	});

	it('closes and opens the selected file', () => {
		const { app, service, openFile } = createContext();
		const didClose = vi.fn();
		new DocumentViewModal(app, service, didClose).open();
		const button = document.querySelector<HTMLButtonElement>(
			'.note-steward-tree-document',
		);
		button?.click();
		expect(openFile).toHaveBeenCalledOnce();
		expect(didClose).toHaveBeenCalledOnce();
		expect(document.querySelector('.note-steward-modal')).toBeNull();
	});
});

describe('attachment view modal', () => {
	it('renders reference details and only enables zero-reference selection', () => {
		const { app, service } = createContext();
		new AttachmentViewModal(app, service).open();

		const rows = document.querySelectorAll('.note-steward-attachment-row');
		expect(rows).toHaveLength(2);
		expect(document.body.textContent).toContain('A.md × 1');
		expect(document.body.textContent).toContain('B.md × 2');
		const checkboxes = document.querySelectorAll<HTMLInputElement>(
			'.note-steward-attachment-row input[type="checkbox"]',
		);
		expect(checkboxes[0]?.disabled).toBe(false);
		expect(checkboxes[1]?.disabled).toBe(true);
		expect(document.querySelector('img, audio, video, iframe')).toBeNull();
	});

	it('clears selection on filtering and keeps it while sorting', () => {
		const { app, service } = createContext();
		new AttachmentViewModal(app, service).open();
		const selectVisible = findButton('Select current results');
		selectVisible?.click();
		expect(document.body.textContent).toContain('1 selected');

		const sort = findSelect('Sort');
		if (sort) {
			sort.value = 'path-asc';
			sort.dispatchEvent(new Event('change'));
		}
		expect(document.body.textContent).toContain('1 selected');

		const ownership = findSelect('Ownership status');
		if (ownership) {
			ownership.value = 'owned';
			ownership.dispatchEvent(new Event('change'));
		}
		expect(document.body.textContent).toContain('0 selected');
	});

	it('restores search focus after rerender and cancellation does not delete', () => {
		const { app, service, deleteAttachments } = createContext();
		new AttachmentViewModal(app, service).open();
		const search = document.querySelector<HTMLInputElement>(
			'input[type="search"]',
		);
		if (!search) return;
		search.value = 'Note';
		search.dispatchEvent(new Event('input'));
		expect(document.activeElement).toBe(
			document.querySelector('input[type="search"]'),
		);

		findButton('Select current results')?.click();
		findButton('Delete selected')?.click();
		expect(document.querySelector('.note-steward-confirm')).not.toBeNull();
		findButton('Cancel')?.click();
		expect(deleteAttachments).not.toHaveBeenCalled();
	});
});

function findButton(text: string): HTMLButtonElement | undefined {
	return Array.from(
		document.querySelectorAll<HTMLButtonElement>('button'),
	).find((button) => button.textContent === text);
}

function findSelect(label: string): HTMLSelectElement | null {
	return document.querySelector(`select[aria-label="${label}"]`);
}

function installObsidianDomHelpers(): void {
	HTMLElement.prototype.empty = function (): void {
		this.replaceChildren();
	};
	HTMLElement.prototype.addClass = function (...classes: string[]): void {
		this.classList.add(...classes);
	};
	HTMLElement.prototype.setText = function (text: string): void {
		this.textContent = text;
	};
	HTMLElement.prototype.createDiv = function (options = {}): HTMLDivElement {
		const element = createNativeElement('div');
		applyElementOptions(element, options);
		this.append(element);
		return element;
	};
	HTMLElement.prototype.createSpan = function (
		options = {},
	): HTMLSpanElement {
		const element = createNativeElement('span');
		applyElementOptions(element, options);
		this.append(element);
		return element;
	};
	HTMLElement.prototype.createEl = function <
		K extends keyof HTMLElementTagNameMap,
	>(tag: K, options: DomElementInfo = {}): HTMLElementTagNameMap[K] {
		const element = createNativeElement(tag);
		applyElementOptions(element, options);
		if (
			'type' in options &&
			options.type &&
			element instanceof HTMLInputElement
		)
			element.type = options.type;
		this.append(element);
		return element;
	};
}

function createNativeElement<K extends keyof HTMLElementTagNameMap>(
	tag: K,
): HTMLElementTagNameMap[K] {
	return document.createElementNS(
		'http://www.w3.org/1999/xhtml',
		tag,
	) as HTMLElementTagNameMap[K];
}

function applyElementOptions(
	element: HTMLElement,
	options: string | DomElementInfo,
): void {
	if (typeof options === 'string') {
		element.className = options;
		return;
	}
	if (options.cls) element.className = String(options.cls);
	if (typeof options.text === 'string') element.textContent = options.text;
	for (const [name, value] of Object.entries(options.attr ?? {}))
		element.setAttribute(name, String(value));
}
