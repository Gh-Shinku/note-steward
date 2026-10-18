import { describe, expect, it } from 'vitest';

import type {
	App,
	CachedMetadata,
	Editor,
	EditorChange,
	TAbstractFile,
} from 'obsidian';
import { TFile, TFolder } from 'obsidian';
import { createEmptyData } from '../src/core/model';
import { StewardService } from '../src/services/steward-service';
import { NoteStewardData } from '../src/types';

interface Harness {
	service: StewardService;
	resolvedLinks: Record<string, Record<string, number>>;
	frontmatter: Map<string, Record<string, unknown>>;
	files: Map<string, TAbstractFile>;
	addFolder: (path: string) => TFolder;
	addFile: (path: string, size?: number, content?: string) => TFile;
	setActiveEditor: (
		file: TFile,
		cache: CachedMetadata,
	) => { content: () => string; transactionCount: () => number };
	processFrontMatterCount: () => number;
	fileManagerRenameCount: () => number;
	vaultRenameCount: () => number;
	lastSaved: () => NoteStewardData | null;
	saveCount: () => number;
}

function createHarness(
	loadedData: unknown = null,
	options: { failRename?: boolean } = {},
): Harness {
	const files = new Map<string, TAbstractFile>();
	const root = new TFolder();
	root.path = '';
	root.name = '';
	files.set('', root);
	const frontmatter = new Map<string, Record<string, unknown>>();
	const contents = new Map<string, string>();
	const resolvedLinks: Record<string, Record<string, number>> = {};
	const metadata = new Map<string, CachedMetadata>();
	let saved: NoteStewardData | null = null;
	let saves = 0;
	let frontmatterWrites = 0;
	let fileManagerRenames = 0;
	let vaultRenames = 0;
	const workspace: { activeEditor: { file: TFile; editor: Editor } | null } =
		{
			activeEditor: null,
		};

	const setFilePath = (file: TFile, path: string): void => {
		file.path = path;
		file.name = path.split('/').at(-1) ?? path;
		const dot = file.name.lastIndexOf('.');
		file.extension = dot >= 0 ? file.name.slice(dot + 1) : '';
		file.basename = dot >= 0 ? file.name.slice(0, dot) : file.name;
	};
	const addFolder = (path: string): TFolder => {
		const folder = new TFolder();
		folder.path = path;
		folder.name = path.split('/').at(-1) ?? path;
		const parentPath = path.includes('/')
			? path.slice(0, path.lastIndexOf('/'))
			: '';
		const parent = files.get(parentPath);
		if (parent instanceof TFolder) {
			folder.parent = parent;
			parent.children.push(folder);
		}
		files.set(path, folder);
		return folder;
	};

	const addFile = (path: string, size = 10, content = ''): TFile => {
		const file = new TFile();
		setFilePath(file, path);
		file.stat = { ctime: 1, mtime: 1, size };
		const parentPath = path.includes('/')
			? path.slice(0, path.lastIndexOf('/'))
			: '';
		const parent = files.get(parentPath);
		if (parent instanceof TFolder) {
			file.parent = parent;
			parent.children.push(file);
		}
		files.set(path, file);
		contents.set(path, content);
		return file;
	};

	const metadataCache = {
		resolvedLinks,
		getFileCache: (file: TFile) => ({
			...(metadata.get(file.path) ?? {}),
			frontmatter: frontmatter.get(file.path) ?? {},
		}),
		getFirstLinkpathDest: (link: string, sourcePath: string) => {
			const path = link.split(/[#^]/u)[0] ?? link;
			const direct = files.get(decodeURI(path));
			if (direct instanceof TFile) return direct;
			const destination = Object.keys(
				resolvedLinks[sourcePath] ?? {},
			).find(
				(candidate) =>
					candidate === path ||
					candidate.endsWith(`/${path}`) ||
					candidate.endsWith(`/${path.split('/').at(-1) ?? path}`),
			);
			const file = destination ? files.get(destination) : null;
			return file instanceof TFile ? file : null;
		},
	};
	const moveFile = (file: TFile, newPath: string): void => {
		const oldPath = file.path;
		if (file.parent)
			file.parent.children = file.parent.children.filter(
				(child) => child !== file,
			);
		files.delete(oldPath);
		const content = contents.get(oldPath);
		contents.delete(oldPath);
		setFilePath(file, newPath);
		const parentPath = newPath.includes('/')
			? newPath.slice(0, newPath.lastIndexOf('/'))
			: '';
		const parent = files.get(parentPath);
		file.parent = parent instanceof TFolder ? parent : null;
		file.parent?.children.push(file);
		files.set(newPath, file);
		if (content !== undefined) contents.set(newPath, content);
	};
	const vault = {
		getFiles: () =>
			[...files.values()].filter(
				(file): file is TFile => file instanceof TFile,
			),
		getMarkdownFiles: () =>
			[...files.values()].filter(
				(file): file is TFile =>
					file instanceof TFile && file.extension === 'md',
			),
		getFileByPath: (path: string) => {
			const file = files.get(path);
			return file instanceof TFile ? file : null;
		},
		getAbstractFileByPath: (path: string) => files.get(path) ?? null,
		getAllFolders: () =>
			[...files.values()].filter(
				(file): file is TFolder => file instanceof TFolder,
			),
		createFolder: (path: string) => Promise.resolve(addFolder(path)),
		cachedRead: (file: TFile) =>
			Promise.resolve(contents.get(file.path) ?? ''),
		rename: (file: TFile, newPath: string) => {
			vaultRenames += 1;
			if (options.failRename)
				return Promise.reject(new Error('Simulated move failure'));
			moveFile(file, newPath);
			return Promise.resolve();
		},
		delete: (file: TAbstractFile) => {
			if (file.parent)
				file.parent.children = file.parent.children.filter(
					(child) => child !== file,
				);
			files.delete(file.path);
			contents.delete(file.path);
			return Promise.resolve();
		},
	};
	const fileManager = {
		processFrontMatter: (file: TFile, update: (value: object) => void) => {
			frontmatterWrites += 1;
			const value = frontmatter.get(file.path) ?? {};
			update(value);
			frontmatter.set(file.path, value);
			return Promise.resolve();
		},
		renameFile: (file: TFile, newPath: string) => {
			fileManagerRenames += 1;
			if (options.failRename)
				return Promise.reject(new Error('Simulated move failure'));
			const oldPath = file.path;
			moveFile(file, newPath);
			for (const destinations of Object.values(resolvedLinks)) {
				const count = destinations[oldPath];
				if (count === undefined) continue;
				destinations[newPath] = count;
				delete destinations[oldPath];
			}
			return Promise.resolve();
		},
		generateMarkdownLink: (
			file: TFile,
			_sourcePath: string,
			subpath = '',
			alias?: string,
		) => `[${alias ?? file.name}](${file.path}${subpath})`,
		trashFile: (file: TAbstractFile) => {
			if (file.parent)
				file.parent.children = file.parent.children.filter(
					(child) => child !== file,
				);
			files.delete(file.path);
			contents.delete(file.path);
			return Promise.resolve();
		},
	};

	const app = {
		vault,
		fileManager,
		metadataCache,
		workspace,
	} as unknown as App;
	const service = new StewardService(app, loadedData, (data) => {
		saves += 1;
		saved = structuredClone(data);
		return Promise.resolve();
	});

	const setActiveEditor = (
		file: TFile,
		cache: CachedMetadata,
	): { content: () => string; transactionCount: () => number } => {
		metadata.set(file.path, cache);
		let transactions = 0;
		const positionToOffset = (
			content: string,
			position: { line: number; ch: number },
		): number => {
			const lines = content.split('\n');
			return (
				lines
					.slice(0, position.line)
					.reduce((total, line) => total + line.length + 1, 0) +
				position.ch
			);
		};
		const editor = {
			getRange: (
				from: { line: number; ch: number },
				to: { line: number; ch: number },
			) => {
				const content = contents.get(file.path) ?? '';
				return content.slice(
					positionToOffset(content, from),
					positionToOffset(content, to),
				);
			},
			transaction: ({ changes = [] }: { changes?: EditorChange[] }) => {
				transactions += 1;
				let content = contents.get(file.path) ?? '';
				for (const change of changes.slice().sort((left, right) => {
					return (
						positionToOffset(content, right.from) -
						positionToOffset(content, left.from)
					);
				})) {
					const from = positionToOffset(content, change.from);
					const to = positionToOffset(
						content,
						change.to ?? change.from,
					);
					content = `${content.slice(0, from)}${change.text}${content.slice(to)}`;
				}
				contents.set(file.path, content);
			},
		} as unknown as Editor;
		workspace.activeEditor = { file, editor };
		return {
			content: () => contents.get(file.path) ?? '',
			transactionCount: () => transactions,
		};
	};

	return {
		service,
		resolvedLinks,
		frontmatter,
		files,
		addFolder,
		addFile,
		setActiveEditor,
		processFrontMatterCount: () => frontmatterWrites,
		fileManagerRenameCount: () => fileManagerRenames,
		vaultRenameCount: () => vaultRenames,
		lastSaved: () => saved,
		saveCount: () => saves,
	};
}

describe('StewardService integration', () => {
	it('excludes document metadata JSON while retaining user JSON files', async () => {
		const harness = createHarness();
		harness.addFile(
			'document.json',
			32,
			JSON.stringify({ type: 'docx', nodes: [] }),
		);
		harness.addFile(
			'settings.json',
			24,
			JSON.stringify({ type: 'settings', nodes: [] }),
		);
		harness.addFile('broken.json', 8, '{ invalid');

		await harness.service.rebuildIndex();

		expect(
			harness.service.getReviewItems().map((item) => item.path),
		).toEqual(['broken.json', 'settings.json']);
	});

	it('removes persisted document metadata JSON without a missing-file issue', async () => {
		const data = createEmptyData();
		data.attachments.metadata = {
			id: 'metadata',
			path: 'document.json',
			ownerDocumentId: null,
			ownershipState: 'unclaimed',
			firstSeenAt: 1,
			claimBlocked: false,
		};
		data.references.metadata = {};
		const harness = createHarness(data);
		harness.addFile(
			'document.json',
			32,
			JSON.stringify({ type: 'docx', nodes: [{ id: 'paragraph' }] }),
		);

		await harness.service.rebuildIndex();

		expect(harness.service.getReviewItems()).toEqual([]);
		expect(harness.service.persistedData.issues).not.toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: 'missing-file' }),
			]),
		);
	});

	it('claims a singly referenced attachment without writing frontmatter', async () => {
		const harness = createHarness();
		const note = harness.addFile('Projects/Plan.md');
		const attachment = harness.addFile('Inbox/image.png', 42);
		harness.resolvedLinks[note.path] = { [attachment.path]: 1 };

		await harness.service.rebuildIndex();

		const document = Object.values(
			harness.service.persistedData.documents,
		).find((candidate) => candidate.path === note.path);
		const documentId = document?.id;
		expect(documentId).toEqual(expect.any(String));
		expect(harness.frontmatter.get(note.path)).toBeUndefined();
		expect(harness.processFrontMatterCount()).toBe(0);
		expect(attachment.path).toBe(
			`Projects/assets/${documentId as string}/image.png`,
		);
		const item = harness.service.getReviewItems()[0];
		expect(item?.ownerPath).toBe(note.path);
		expect(item?.totalReferences).toBe(1);
		expect(harness.lastSaved()?.attachments[item?.id ?? '']?.path).toBe(
			attachment.path,
		);
		expect(harness.service.getDocumentTreeItems()).toEqual([
			expect.objectContaining({
				documentId,
				path: note.path,
				name: 'Plan.md',
				attachments: [expect.objectContaining({ id: item?.id })],
			}),
		]);
	});

	it('preserves a data-only document UUID across rebuilds', async () => {
		const harness = createHarness();
		const note = harness.addFile('Projects/Plan.md');
		const attachment = harness.addFile('Inbox/image.png');
		harness.resolvedLinks[note.path] = { [attachment.path]: 1 };
		await harness.service.rebuildIndex();
		const documentId = Object.values(
			harness.service.persistedData.documents,
		).find((candidate) => candidate.path === note.path)?.id;

		await harness.service.rebuildIndex();

		expect(
			Object.values(harness.service.persistedData.documents).find(
				(candidate) => candidate.path === note.path,
			)?.id,
		).toBe(documentId);
		expect(harness.frontmatter.get(note.path)).toBeUndefined();
	});

	it('rebuild reconsiders a blocked unclaimed attachment with one reference', async () => {
		const data = createEmptyData();
		data.attachments['asset-id'] = {
			id: 'asset-id',
			path: 'Inbox/image.png',
			ownerDocumentId: null,
			ownershipState: 'unclaimed',
			firstSeenAt: 1,
			claimBlocked: true,
		};
		data.references['asset-id'] = { 'Old.md': 1, 'Other.md': 1 };
		const harness = createHarness(data);
		const note = harness.addFile('Projects/Plan.md');
		const attachment = harness.addFile('Inbox/image.png');
		harness.resolvedLinks[note.path] = { [attachment.path]: 1 };

		await harness.service.rebuildIndex();

		const item = harness.service.getReviewItems()[0];
		expect(item?.ownerPath).toBe(note.path);
		expect(item?.ownershipState).toBe('owned');
		expect(item?.totalReferences).toBe(1);
	});

	it('rebuild leaves an attachment with two references unclaimed', async () => {
		const harness = createHarness();
		const note = harness.addFile('Projects/Plan.md');
		const attachment = harness.addFile('Inbox/image.png');
		harness.resolvedLinks[note.path] = { [attachment.path]: 2 };

		await harness.service.rebuildIndex();

		const item = harness.service.getReviewItems()[0];
		expect(item?.ownerDocumentId).toBeNull();
		expect(item?.ownershipState).toBe('unclaimed');
		expect(item?.totalReferences).toBe(2);
		expect(attachment.path).toBe('Inbox/image.png');
	});

	it('does not persist when incremental reference reconciliation is unchanged', async () => {
		const harness = createHarness();
		const note = harness.addFile('Note.md');
		const attachment = harness.addFile('image.png');
		harness.resolvedLinks[note.path] = { [attachment.path]: 1 };
		await harness.service.rebuildIndex();
		const saves = harness.saveCount();

		await (
			harness.service as unknown as {
				reconcileReferenceSources: (
					paths: Set<string>,
				) => Promise<void>;
			}
		).reconcileReferenceSources(new Set([note.path]));

		expect(harness.saveCount()).toBe(saves);
	});

	it('incrementally claims a newly referenced attachment and persists once', async () => {
		const harness = createHarness();
		const note = harness.addFile('Projects/Note.md');
		const attachment = harness.addFile('Inbox/image.png');
		await harness.service.rebuildIndex();
		const saves = harness.saveCount();
		harness.resolvedLinks[note.path] = { [attachment.path]: 1 };

		await (
			harness.service as unknown as {
				reconcileReferenceSources: (
					paths: Set<string>,
				) => Promise<void>;
			}
		).reconcileReferenceSources(new Set([note.path]));

		const item = harness.service.getReviewItems()[0];
		expect(item?.ownerPath).toBe(note.path);
		expect(item?.totalReferences).toBe(1);
		expect(attachment.path).toMatch(
			/^Projects\/assets\/[^/]+\/image\.png$/,
		);
		expect(harness.saveCount()).toBe(saves + 1);
	});

	it('silently moves a first claim referenced by the active editor', async () => {
		const harness = createHarness();
		const note = harness.addFile(
			'Projects/Note.md',
			10,
			'![](../Inbox/image.png)',
		);
		const attachment = harness.addFile('Inbox/image.png');
		await harness.service.rebuildIndex();
		harness.resolvedLinks[note.path] = { [attachment.path]: 1 };
		const editor = harness.setActiveEditor(note, {
			embeds: [
				{
					link: '../Inbox/image.png',
					original: '![](../Inbox/image.png)',
					displayText: '',
					position: {
						start: { line: 0, col: 0, offset: 0 },
						end: { line: 0, col: 24, offset: 24 },
					},
				},
			],
		});

		await (
			harness.service as unknown as {
				reconcileReferenceSources: (
					paths: Set<string>,
				) => Promise<void>;
			}
		).reconcileReferenceSources(new Set([note.path]));

		expect(harness.vaultRenameCount()).toBe(1);
		expect(harness.fileManagerRenameCount()).toBe(0);
		expect(harness.processFrontMatterCount()).toBe(0);
		expect(editor.transactionCount()).toBe(1);
		expect(editor.content()).toMatch(
			/^!\[\]\(Projects\/assets\/[^/]+\/image\.png\)$/u,
		);
		expect(attachment.path).toMatch(
			/^Projects\/assets\/[^/]+\/image\.png$/u,
		);
		expect(harness.service.getReviewItems()[0]?.ownershipState).toBe(
			'owned',
		);
	});

	it('does not move an active first claim when its cached range is stale', async () => {
		const harness = createHarness();
		const note = harness.addFile(
			'Projects/Note.md',
			10,
			'changed ![](../Inbox/image.png)',
		);
		const attachment = harness.addFile('Inbox/image.png');
		await harness.service.rebuildIndex();
		harness.resolvedLinks[note.path] = { [attachment.path]: 1 };
		harness.setActiveEditor(note, {
			embeds: [
				{
					link: '../Inbox/image.png',
					original: '![](../Inbox/image.png)',
					displayText: '',
					position: {
						start: { line: 0, col: 0, offset: 0 },
						end: { line: 0, col: 24, offset: 24 },
					},
				},
			],
		});

		await (
			harness.service as unknown as {
				reconcileReferenceSources: (
					paths: Set<string>,
				) => Promise<void>;
			}
		).reconcileReferenceSources(new Set([note.path]));

		expect(attachment.path).toBe('Inbox/image.png');
		expect(harness.vaultRenameCount()).toBe(0);
		expect(harness.fileManagerRenameCount()).toBe(0);
		expect(harness.service.getReviewItems()[0]?.ownershipState).toBe(
			'needs-repair',
		);
	});

	it('prunes missing documents that no longer own attachments', async () => {
		const data = createEmptyData();
		data.documents.stale = {
			id: 'stale',
			path: 'Deleted.md',
			exists: false,
		};
		const harness = createHarness(data);

		await harness.service.rebuildIndex();

		expect(harness.service.persistedData.documents).not.toHaveProperty(
			'stale',
		);
	});

	it('omits documents that own no attachments from the document tree', async () => {
		const harness = createHarness();
		const empty = harness.addFile('Empty.md');
		harness.frontmatter.set(empty.path, { 'note-steward-id': 'empty' });
		harness.addFile('orphan.png');

		await harness.service.rebuildIndex();

		expect(harness.service.getDocumentTreeItems()).toEqual([]);
	});

	it('omits an indexed owner document that is missing from the vault', async () => {
		const harness = createHarness();
		const note = harness.addFile('Note.md');
		const attachment = harness.addFile('image.png');
		harness.resolvedLinks[note.path] = { [attachment.path]: 1 };

		await harness.service.rebuildIndex();
		harness.files.delete(note.path);

		expect(harness.service.getDocumentTreeItems()).toEqual([]);
	});

	it('rebuild claims formerly ambiguous ownership after one reference remains', async () => {
		const harness = createHarness();
		const first = harness.addFile('A.md');
		const second = harness.addFile('B.md');
		const attachment = harness.addFile('shared.pdf');
		harness.resolvedLinks[first.path] = { [attachment.path]: 1 };
		harness.resolvedLinks[second.path] = { [attachment.path]: 1 };

		await harness.service.rebuildIndex();
		expect(harness.service.getReviewItems()[0]?.ownershipState).toBe(
			'unclaimed',
		);

		delete harness.resolvedLinks[second.path];
		await harness.service.rebuildIndex();
		const item = harness.service.getReviewItems()[0];
		expect(item?.ownershipState).toBe('owned');
		expect(item?.ownerPath).toBe(first.path);
		expect(item?.totalReferences).toBe(1);
	});

	it('uses a numeric suffix instead of overwriting a destination collision', async () => {
		const harness = createHarness();
		const note = harness.addFile('Projects/Plan.md');
		harness.frontmatter.set(note.path, { 'note-steward-id': 'doc-id' });
		const attachment = harness.addFile('Inbox/image.png');
		harness.addFile('Projects/assets/doc-id/image.png');
		harness.resolvedLinks[note.path] = { [attachment.path]: 1 };

		await harness.service.rebuildIndex();

		expect(attachment.path).toBe('Projects/assets/doc-id/image-1.png');
		expect(harness.files.has('Projects/assets/doc-id/image.png')).toBe(
			true,
		);
	});

	it('deletes only zero-reference attachments and skips referenced files', async () => {
		const harness = createHarness();
		const note = harness.addFile('Note.md');
		const referenced = harness.addFile('referenced.png');
		const orphaned = harness.addFile('orphaned.png');
		harness.resolvedLinks[note.path] = { [referenced.path]: 1 };
		await harness.service.rebuildIndex();
		const indexed = harness.service.getReviewItems();
		const referencedItem = indexed.find(
			(item) => item.name === 'referenced.png',
		);
		const orphanedItem = indexed.find(
			(item) => item.name === 'orphaned.png',
		);

		const result = await harness.service.deleteAttachments(
			[referencedItem?.id, orphanedItem?.id].filter((id): id is string =>
				Boolean(id),
			),
		);

		expect(result.deleted).toBe(1);
		expect(result.skipped).toBe(1);
		expect(harness.files.has(orphaned.path)).toBe(false);
		expect(harness.files.has(referenced.path)).toBe(true);
	});

	it('restores ownership from a valid UUID folder when rebuilding lost index data', async () => {
		const harness = createHarness();
		const owner = harness.addFile('Projects/Plan.md');
		const other = harness.addFile('Other.md');
		harness.frontmatter.set(owner.path, {
			'note-steward-id': 'stable-document-id',
		});
		const attachment = harness.addFile(
			'Projects/assets/stable-document-id/shared.pdf',
		);
		harness.resolvedLinks[owner.path] = { [attachment.path]: 1 };
		harness.resolvedLinks[other.path] = { [attachment.path]: 1 };

		await harness.service.rebuildIndex();

		const item = harness.service.getReviewItems()[0];
		expect(item?.ownershipState).toBe('owned');
		expect(item?.ownerPath).toBe(owner.path);
		expect(item?.totalReferences).toBe(2);
	});

	it('retains ownership at zero references and marks a missing owner', async () => {
		const data = createEmptyData();
		data.documents['doc-id'] = {
			id: 'doc-id',
			path: 'Deleted.md',
			exists: true,
		};
		data.attachments['asset-id'] = {
			id: 'asset-id',
			path: 'assets/doc-id/image.png',
			ownerDocumentId: 'doc-id',
			ownershipState: 'owned',
			firstSeenAt: 1,
			claimedAt: 2,
			claimBlocked: false,
		};
		data.references['asset-id'] = {};
		const harness = createHarness(data);
		harness.addFile('assets/doc-id/image.png');

		await harness.service.rebuildIndex();

		const item = harness.service.getReviewItems()[0];
		expect(item?.totalReferences).toBe(0);
		expect(item?.ownerDocumentId).toBe('doc-id');
		expect(item?.ownershipState).toBe('owner-missing');
	});

	it('rebuild moves a drifted attachment back to its owner', async () => {
		const data = createEmptyData();
		data.documents['doc-id'] = {
			id: 'doc-id',
			path: 'Projects/Plan.md',
			exists: true,
		};
		data.attachments['asset-id'] = {
			id: 'asset-id',
			path: 'Elsewhere/image.png',
			ownerDocumentId: 'doc-id',
			ownershipState: 'owned',
			firstSeenAt: 1,
			claimBlocked: false,
		};
		data.references['asset-id'] = {};
		const harness = createHarness(data);
		const owner = harness.addFile('Projects/Plan.md');
		harness.frontmatter.set(owner.path, { 'note-steward-id': 'doc-id' });
		const attachment = harness.addFile('Elsewhere/image.png');

		await harness.service.rebuildIndex();
		expect(attachment.path).toBe('Projects/assets/doc-id/image.png');
		expect(harness.service.getReviewItems()[0]?.ownershipState).toBe(
			'owned',
		);
	});

	it('removes the old managed UUID folder and empty assets parent after migration', async () => {
		const data = createEmptyData();
		data.documents['doc-id'] = {
			id: 'doc-id',
			path: 'New/Plan.md',
			exists: true,
		};
		data.attachments['asset-id'] = {
			id: 'asset-id',
			path: 'Old/assets/doc-id/image.png',
			ownerDocumentId: 'doc-id',
			ownershipState: 'owned',
			firstSeenAt: 1,
			claimBlocked: false,
		};
		data.references['asset-id'] = {};
		const harness = createHarness(data);
		harness.addFolder('Old');
		harness.addFolder('Old/assets');
		harness.addFolder('Old/assets/doc-id');
		harness.addFolder('New');
		const owner = harness.addFile('New/Plan.md');
		harness.frontmatter.set(owner.path, { 'note-steward-id': 'doc-id' });
		const attachment = harness.addFile('Old/assets/doc-id/image.png');

		await harness.service.rebuildIndex();

		expect(attachment.path).toBe('New/assets/doc-id/image.png');
		expect(harness.files.has('Old/assets/doc-id')).toBe(false);
		expect(harness.files.has('Old/assets')).toBe(false);
	});

	it('rebuild removes empty managed folders left by earlier plugin versions', async () => {
		const data = createEmptyData();
		data.documents['doc-id'] = {
			id: 'doc-id',
			path: 'Current/Plan.md',
			exists: true,
		};
		data.attachments['asset-id'] = {
			id: 'asset-id',
			path: 'Current/assets/doc-id/image.png',
			ownerDocumentId: 'doc-id',
			ownershipState: 'owned',
			firstSeenAt: 1,
			claimBlocked: false,
		};
		data.references['asset-id'] = {};
		const harness = createHarness(data);
		harness.addFolder('Current');
		harness.addFolder('Current/assets');
		harness.addFolder('Current/assets/doc-id');
		const owner = harness.addFile('Current/Plan.md');
		harness.frontmatter.set(owner.path, { 'note-steward-id': 'doc-id' });
		harness.addFile('Current/assets/doc-id/image.png');
		harness.addFolder('Legacy');
		harness.addFolder('Legacy/assets');
		harness.addFolder('Legacy/assets/doc-id');

		await harness.service.rebuildIndex();

		expect(harness.files.has('Legacy/assets/doc-id')).toBe(false);
		expect(harness.files.has('Legacy/assets')).toBe(false);
		expect(harness.files.has('Current/assets/doc-id/image.png')).toBe(true);
	});

	it('keeps the old assets parent when it still contains unrelated files', async () => {
		const data = createEmptyData();
		data.documents['doc-id'] = {
			id: 'doc-id',
			path: 'New/Plan.md',
			exists: true,
		};
		data.attachments['asset-id'] = {
			id: 'asset-id',
			path: 'Old/assets/doc-id/image.png',
			ownerDocumentId: 'doc-id',
			ownershipState: 'owned',
			firstSeenAt: 1,
			claimBlocked: false,
		};
		data.references['asset-id'] = {};
		const harness = createHarness(data);
		harness.addFolder('Old');
		harness.addFolder('Old/assets');
		harness.addFolder('Old/assets/doc-id');
		harness.addFolder('New');
		const owner = harness.addFile('New/Plan.md');
		harness.frontmatter.set(owner.path, { 'note-steward-id': 'doc-id' });
		harness.addFile('Old/assets/doc-id/image.png');
		harness.addFile('Old/assets/keep.txt');

		await harness.service.rebuildIndex();

		expect(harness.files.has('Old/assets/doc-id')).toBe(false);
		expect(harness.files.has('Old/assets')).toBe(true);
		expect(harness.files.has('Old/assets/keep.txt')).toBe(true);
	});

	it('reports duplicate document UUIDs without silently choosing the second note', async () => {
		const harness = createHarness();
		const first = harness.addFile('First.md');
		const second = harness.addFile('Second.md');
		harness.frontmatter.set(first.path, { 'note-steward-id': 'duplicate' });
		harness.frontmatter.set(second.path, {
			'note-steward-id': 'duplicate',
		});

		await harness.service.rebuildIndex();

		expect(harness.service.persistedData.issues).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: 'duplicate-document-id',
					path: 'Second.md',
				}),
			]),
		);
	});

	it('records a failed migration as a repair issue and leaves the file in place', async () => {
		const harness = createHarness(null, { failRename: true });
		const note = harness.addFile('Plan.md');
		const attachment = harness.addFile('Inbox/image.png');
		harness.resolvedLinks[note.path] = { [attachment.path]: 1 };

		await harness.service.rebuildIndex();

		expect(attachment.path).toBe('Inbox/image.png');
		expect(harness.service.getReviewItems()[0]?.ownershipState).toBe(
			'needs-repair',
		);
		expect(harness.service.persistedData.issues).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: 'move-failed' }),
			]),
		);
	});

	it('skips deletion when a reference appears after confirmation data was shown', async () => {
		const harness = createHarness();
		const attachment = harness.addFile('orphaned.png');
		await harness.service.rebuildIndex();
		const id = harness.service.getReviewItems()[0]?.id;
		const note = harness.addFile('New reference.md');
		harness.resolvedLinks[note.path] = { [attachment.path]: 1 };

		const result = await harness.service.deleteAttachments(id ? [id] : []);

		expect(result).toEqual({ deleted: 0, skipped: 1 });
		expect(harness.files.has(attachment.path)).toBe(true);
	});
});
