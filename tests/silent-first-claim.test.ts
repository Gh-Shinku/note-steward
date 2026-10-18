import { describe, expect, it, vi } from 'vitest';

import type {
	App,
	CachedMetadata,
	Editor,
	EditorChange,
	ReferenceCache,
} from 'obsidian';
import { TFile } from 'obsidian';
import { moveFirstClaimSilently } from '../src/services/silent-first-claim';

function createFile(path: string): TFile {
	const file = new TFile();
	file.path = path;
	file.name = path.split('/').at(-1) ?? path;
	file.extension = file.name.split('.').at(-1) ?? '';
	file.basename = file.name.slice(0, -(file.extension.length + 1));
	return file;
}

function createReference(
	content: string,
	original: string,
	link: string,
	displayText: string,
): ReferenceCache {
	const offset = content.indexOf(original);
	return {
		link,
		original,
		displayText,
		position: {
			start: { line: 0, col: offset, offset },
			end: {
				line: 0,
				col: offset + original.length,
				offset: offset + original.length,
			},
		},
	};
}

function createHarness(
	initialContent: string,
	cache: CachedMetadata,
	generateMarkdownLink: (
		file: TFile,
		sourcePath: string,
		subpath?: string,
		alias?: string,
	) => string,
): {
	app: App;
	source: TFile;
	attachment: TFile;
	content: () => string;
	setContent: (value: string) => void;
	transaction: ReturnType<typeof vi.fn>;
} {
	const source = createFile('文档/笔记.md');
	const attachment = createFile('附件/图像.png');
	let content = initialContent;
	const transaction = vi.fn(
		({ changes = [] }: { changes?: EditorChange[] }) => {
			for (const change of changes.slice().sort((left, right) => {
				return right.from.ch - left.from.ch;
			})) {
				const to = change.to?.ch ?? change.from.ch;
				content = `${content.slice(0, change.from.ch)}${change.text}${content.slice(to)}`;
			}
		},
	);
	const editor = {
		getRange: (
			from: { line: number; ch: number },
			to: { line: number; ch: number },
		) => content.slice(from.ch, to.ch),
		transaction,
	} as unknown as Editor;
	const app = {
		workspace: { activeEditor: { file: source, editor } },
		metadataCache: {
			getFileCache: () => cache,
			getFirstLinkpathDest: () => attachment,
		},
		fileManager: { generateMarkdownLink },
	} as unknown as App;
	return {
		app,
		source,
		attachment,
		content: () => content,
		setContent: (value) => {
			content = value;
		},
		transaction,
	};
}

describe('silent first-claim migration', () => {
	it('rewrites multiple links in one transaction and preserves link details', async () => {
		const content = '![[图像.png|预览]] and [PDF](../附件/图像.png#page=2)';
		const embed = createReference(
			content,
			'![[图像.png|预览]]',
			'图像.png',
			'预览',
		);
		const link = createReference(
			content,
			'[PDF](../附件/图像.png#page=2)',
			'../附件/图像.png#page=2',
			'PDF',
		);
		const generate = vi.fn(
			(_file: TFile, _source: string, subpath = '', alias?: string) =>
				`[[new.png${subpath}${alias === undefined ? '' : `|${alias}`}]]`,
		);
		const harness = createHarness(
			content,
			{ embeds: [embed], links: [link] },
			generate,
		);
		const rename = vi.fn((file: TFile, destination: string) => {
			file.path = destination;
			return Promise.resolve();
		});

		const result = await moveFirstClaimSilently({
			app: harness.app,
			source: harness.source,
			attachment: harness.attachment,
			destination: '文档/assets/id/图像.png',
			expectedReferenceCount: 2,
			rename,
		});

		expect(result).toEqual({ moved: true });
		expect(rename).toHaveBeenCalledTimes(1);
		expect(harness.transaction).toHaveBeenCalledTimes(1);
		expect(generate).toHaveBeenCalledWith(
			harness.attachment,
			'文档/笔记.md',
			'',
			'预览',
		);
		expect(generate).toHaveBeenCalledWith(
			harness.attachment,
			'文档/笔记.md',
			'#page=2',
			'PDF',
		);
		expect(harness.content()).toBe(
			'![[new.png|预览]] and [[new.png#page=2|PDF]]',
		);
	});

	it('rolls the file back when the editor changes during the rename', async () => {
		const content = '![](../附件/图像.png)';
		const embed = createReference(content, content, '../附件/图像.png', '');
		const harness = createHarness(
			content,
			{ embeds: [embed] },
			() => '[[new]]',
		);
		const originalPath = harness.attachment.path;
		const rename = vi.fn((file: TFile, destination: string) => {
			file.path = destination;
			if (destination !== originalPath) harness.setContent(`x${content}`);
			return Promise.resolve();
		});

		await expect(
			moveFirstClaimSilently({
				app: harness.app,
				source: harness.source,
				attachment: harness.attachment,
				destination: '文档/assets/id/图像.png',
				expectedReferenceCount: 1,
				rename,
			}),
		).rejects.toThrow('active editor changed');

		expect(rename).toHaveBeenCalledTimes(2);
		expect(harness.attachment.path).toBe(originalPath);
		expect(harness.transaction).not.toHaveBeenCalled();
	});

	it('rolls the file back when the editor transaction fails', async () => {
		const content = '![[图像.png]]';
		const embed = createReference(content, content, '图像.png', '图像.png');
		const harness = createHarness(
			content,
			{ embeds: [embed] },
			() => '[[new]]',
		);
		harness.transaction.mockImplementationOnce(() => {
			throw new Error('Simulated transaction failure');
		});
		const originalPath = harness.attachment.path;
		const rename = vi.fn((file: TFile, destination: string) => {
			file.path = destination;
			return Promise.resolve();
		});

		await expect(
			moveFirstClaimSilently({
				app: harness.app,
				source: harness.source,
				attachment: harness.attachment,
				destination: '文档/assets/id/图像.png',
				expectedReferenceCount: 1,
				rename,
			}),
		).rejects.toThrow('Simulated transaction failure');

		expect(rename).toHaveBeenCalledTimes(2);
		expect(harness.attachment.path).toBe(originalPath);
	});

	it('refuses to move when the cache does not contain every reference', async () => {
		const content = '![[图像.png]]';
		const embed = createReference(content, content, '图像.png', '图像.png');
		const harness = createHarness(
			content,
			{ embeds: [embed] },
			() => '[[new]]',
		);
		const rename = vi.fn();

		const result = await moveFirstClaimSilently({
			app: harness.app,
			source: harness.source,
			attachment: harness.attachment,
			destination: '文档/assets/id/图像.png',
			expectedReferenceCount: 2,
			rename,
		});

		expect(result).toEqual({
			moved: false,
			reason: 'The active editor link cache is incomplete.',
		});
		expect(rename).not.toHaveBeenCalled();
	});
});
