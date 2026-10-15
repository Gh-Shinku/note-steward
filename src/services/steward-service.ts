import {
	App,
	normalizePath,
	Plugin,
	TAbstractFile,
	TFile,
	TFolder,
} from 'obsidian';
import {
	appendNumericSuffix,
	expectedAttachmentFolder,
	hydrateData,
	parentPath,
	shouldAutoClaim,
	shouldClaimDuringRebuild,
	sumReferenceCounts,
} from '../core/model';
import {
	AttachmentRecord,
	DocumentTreeItem,
	DocumentRecord,
	FRONTMATTER_ID_KEY,
	IndexIssue,
	NoteStewardData,
	ReviewItem,
} from '../types';
import { createId } from '../utils/id';

type PersistData = (data: NoteStewardData) => Promise<void>;
type ChangeListener = () => void;

interface DeleteResult {
	deleted: number;
	skipped: number;
}

interface MetadataClassification {
	mtime: number;
	size: number;
	isDocumentMetadata: boolean;
}

export class StewardService {
	private data: NoteStewardData;
	private readonly listeners = new Set<ChangeListener>();
	private operationQueue: Promise<void> = Promise.resolve();
	private reconcileTimer: number | null = null;
	private readonly metadataClassifications = new Map<
		string,
		MetadataClassification
	>();

	constructor(
		private readonly app: App,
		loadedData: unknown,
		private readonly persistData: PersistData,
	) {
		this.data = hydrateData(loadedData);
	}

	register(plugin: Plugin): void {
		plugin.registerEvent(
			this.app.vault.on('create', () => this.scheduleReconcile()),
		);
		plugin.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				this.enqueue(async () => this.handleRename(file, oldPath));
			}),
		);
		plugin.registerEvent(
			this.app.vault.on('delete', (file) => {
				this.enqueue(async () => this.handleDelete(file));
			}),
		);
		plugin.registerEvent(
			this.app.metadataCache.on('resolved', () =>
				this.scheduleReconcile(),
			),
		);
		plugin.registerEvent(
			this.app.metadataCache.on('changed', () =>
				this.scheduleReconcile(),
			),
		);
		plugin.registerEvent(
			this.app.metadataCache.on('deleted', () =>
				this.scheduleReconcile(),
			),
		);
		plugin.register(() => {
			if (this.reconcileTimer !== null)
				window.clearTimeout(this.reconcileTimer);
		});
		this.app.workspace.onLayoutReady(() => {
			this.enqueue(async () => this.scanVault(true));
		});
	}

	get persistedData(): NoteStewardData {
		return this.data;
	}

	async setLocale(
		locale: NoteStewardData['settings']['locale'],
	): Promise<void> {
		this.data.settings.locale = locale;
		await this.saveAndNotify();
	}

	onChange(listener: ChangeListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	getReviewItems(): ReviewItem[] {
		const items: ReviewItem[] = [];
		for (const record of Object.values(this.data.attachments)) {
			const file = this.app.vault.getFileByPath(record.path);
			if (!file) continue;
			const references = Object.entries(
				this.data.references[record.id] ?? {},
			)
				.map(([path, count]) => ({ path, count }))
				.sort((left, right) => left.path.localeCompare(right.path));
			const owner = record.ownerDocumentId
				? this.data.documents[record.ownerDocumentId]
				: undefined;
			const item: ReviewItem = {
				id: record.id,
				path: record.path,
				name: file.name,
				extension: file.extension.toLocaleLowerCase(),
				size: file.stat.size,
				ownerDocumentId: record.ownerDocumentId,
				ownerPath: owner?.path ?? null,
				ownershipState: record.ownershipState,
				totalReferences: sumReferenceCounts(
					this.data.references[record.id] ?? {},
				),
				references,
			};
			if (record.issue) item.issue = record.issue;
			items.push(item);
		}
		return items.sort((left, right) => left.path.localeCompare(right.path));
	}

	getDocumentTreeItems(): DocumentTreeItem[] {
		const attachments = this.getReviewItems();
		return Object.values(this.data.documents)
			.filter((document) => document.exists)
			.flatMap((document) => {
				const file = this.app.vault.getFileByPath(document.path);
				if (!(file instanceof TFile) || file.extension !== 'md')
					return [];
				const owned = attachments
					.filter(
						(attachment) =>
							attachment.ownerDocumentId === document.id,
					)
					.sort((left, right) => left.path.localeCompare(right.path));
				if (owned.length === 0) return [];
				return [
					{
						documentId: document.id,
						path: document.path,
						name: file.name,
						attachments: owned,
					},
				];
			})
			.sort((left, right) => left.path.localeCompare(right.path));
	}

	getMarkdownFiles(): TFile[] {
		return this.app.vault
			.getMarkdownFiles()
			.slice()
			.sort((left, right) => left.path.localeCompare(right.path));
	}

	getFolderPaths(): string[] {
		return this.app.vault
			.getAllFolders(true)
			.map((folder) => folder.path)
			.sort((left, right) => left.localeCompare(right));
	}

	getFile(path: string): TFile | null {
		return this.app.vault.getFileByPath(path);
	}

	async rebuildIndex(): Promise<void> {
		return this.runExclusive(async () => {
			await this.scanVault(false, true);
			for (const attachment of Object.values(this.data.attachments)) {
				if (attachment.ownerDocumentId)
					await this.moveAttachmentToOwner(attachment);
			}
			await this.cleanupEmptyManagedFolders();
			await this.saveAndNotify();
		});
	}

	async assignOwner(
		attachmentId: string,
		notePath: string,
	): Promise<boolean> {
		return this.runExclusive(async () => {
			const attachment = this.data.attachments[attachmentId];
			const note = this.app.vault.getFileByPath(notePath);
			if (!attachment || !note || note.extension !== 'md') return false;
			const document = await this.ensureDocument(note);
			if (!document) return false;
			attachment.ownerDocumentId = document.id;
			attachment.ownershipState = 'owned';
			attachment.claimBlocked = false;
			attachment.claimedAt = Date.now();
			delete attachment.issue;
			await this.moveAttachmentToOwner(attachment);
			await this.saveAndNotify();
			return true;
		});
	}

	async deleteAttachments(attachmentIds: string[]): Promise<DeleteResult> {
		return this.runExclusive(async () => {
			const previousReferences = Object.fromEntries(
				attachmentIds.map((id) => [
					id,
					{ ...(this.data.references[id] ?? {}) },
				]),
			);
			await this.scanVault(false);
			let deleted = 0;
			let skipped = 0;
			for (const id of attachmentIds) {
				const attachment = this.data.attachments[id];
				if (!attachment) continue;
				const liveReferences = this.referencesForPath(attachment.path);
				if (
					sumReferenceCounts(previousReferences[id] ?? {}) > 0 ||
					sumReferenceCounts(liveReferences) > 0
				) {
					skipped += 1;
					continue;
				}
				const file = this.app.vault.getFileByPath(attachment.path);
				if (!file) {
					skipped += 1;
					continue;
				}
				await this.app.fileManager.trashFile(file);
				delete this.data.attachments[id];
				delete this.data.references[id];
				deleted += 1;
			}
			await this.saveAndNotify();
			return { deleted, skipped };
		});
	}

	private scheduleReconcile(): void {
		if (this.reconcileTimer !== null)
			window.clearTimeout(this.reconcileTimer);
		this.reconcileTimer = window.setTimeout(() => {
			this.reconcileTimer = null;
			this.enqueue(async () => this.scanVault(false));
		}, 750);
	}

	private enqueue(operation: () => Promise<void>): void {
		void this.runExclusive(operation).catch((error: unknown) => {
			console.error('Note Steward background operation failed', error);
		});
	}

	private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
		const result = this.operationQueue.then(operation, operation);
		this.operationQueue = result.then(
			() => undefined,
			() => undefined,
		);
		return result;
	}

	private async scanVault(
		moveNewClaims: boolean,
		rebuildOwnership = false,
	): Promise<void> {
		const previousAttachments = this.data.attachments;
		const previousDocuments = this.data.documents;
		const issues: IndexIssue[] = [];
		const documents = this.discoverDocuments(previousDocuments, issues);
		const referencesByPath = this.buildReferenceSnapshot();
		const attachments: Record<string, AttachmentRecord> = {};
		const references: Record<string, Record<string, number>> = {};
		const newlyClaimed: AttachmentRecord[] = [];
		const excludedAttachmentIds = new Set<string>();
		const scannedJsonPaths = new Set<string>();

		for (const file of this.app.vault.getFiles()) {
			if (file.extension === 'md') continue;
			const previous = Object.values(previousAttachments).find(
				(record) => record.path === file.path,
			);
			if (file.extension.toLocaleLowerCase() === 'json') {
				scannedJsonPaths.add(file.path);
				if (await this.isDocumentMetadata(file)) {
					if (previous) excludedAttachmentIds.add(previous.id);
					continue;
				}
			}
			const currentReferences = referencesByPath[file.path] ?? {};
			const record: AttachmentRecord = previous
				? { ...previous }
				: {
						id: createId(),
						path: file.path,
						ownerDocumentId: null,
						ownershipState: 'unclaimed',
						firstSeenAt: Date.now(),
						claimBlocked: Object.keys(currentReferences).length > 1,
					};
			record.path = file.path;
			if (!previous && !record.ownerDocumentId) {
				const inferredOwner = this.inferOwnerFromPath(
					file.path,
					documents,
				);
				if (inferredOwner) {
					record.ownerDocumentId = inferredOwner.id;
					record.ownershipState = 'owned';
					record.claimBlocked = false;
					record.claimedAt = Date.now();
				}
			}

			if (record.ownerDocumentId) {
				const owner = documents[record.ownerDocumentId];
				if (!owner?.exists) {
					record.ownershipState = 'owner-missing';
					delete record.issue;
				} else {
					this.applyPathState(record, owner, issues);
				}
			} else if (
				rebuildOwnership
					? shouldClaimDuringRebuild(record, currentReferences)
					: shouldAutoClaim(record, currentReferences)
			) {
				const [sourcePath] = Object.keys(currentReferences);
				const note = sourcePath
					? this.app.vault.getFileByPath(sourcePath)
					: null;
				if (note) {
					const document = await this.ensureDocument(
						note,
						documents,
						issues,
					);
					if (document) {
						record.ownerDocumentId = document.id;
						record.ownershipState = 'owned';
						record.claimedAt = Date.now();
						record.claimBlocked = false;
						newlyClaimed.push(record);
					}
				}
			} else {
				record.ownershipState = 'unclaimed';
				if (Object.keys(currentReferences).length > 1)
					record.claimBlocked = true;
				delete record.issue;
			}

			attachments[record.id] = record;
			references[record.id] = currentReferences;
		}

		for (const previous of Object.values(previousAttachments)) {
			if (excludedAttachmentIds.has(previous.id)) continue;
			if (
				Object.values(attachments).some(
					(record) => record.id === previous.id,
				)
			)
				continue;
			issues.push({
				id: createId(),
				kind: 'missing-file',
				path: previous.path,
				detail: 'Indexed attachment no longer exists in the vault.',
			});
		}
		for (const path of this.metadataClassifications.keys()) {
			if (!scannedJsonPaths.has(path))
				this.metadataClassifications.delete(path);
		}

		this.data = {
			...this.data,
			documents,
			attachments,
			references,
			issues,
			lastIndexedAt: Date.now(),
		};
		await this.saveAndNotify();

		const toMove = moveNewClaims ? newlyClaimed : [];
		for (const record of toMove) await this.moveAttachmentToOwner(record);
		if (toMove.length > 0) await this.saveAndNotify();
	}

	private async isDocumentMetadata(file: TFile): Promise<boolean> {
		const cached = this.metadataClassifications.get(file.path);
		if (cached?.mtime === file.stat.mtime && cached.size === file.stat.size)
			return cached.isDocumentMetadata;

		let isDocumentMetadata = false;
		try {
			const value: unknown = JSON.parse(
				await this.app.vault.cachedRead(file),
			);
			isDocumentMetadata =
				typeof value === 'object' &&
				value !== null &&
				Reflect.get(value, 'type') === 'docx' &&
				Array.isArray(Reflect.get(value, 'nodes'));
		} catch {
			// Invalid JSON is still a user attachment, not a metadata sidecar.
		}
		this.metadataClassifications.set(file.path, {
			mtime: file.stat.mtime,
			size: file.stat.size,
			isDocumentMetadata,
		});
		return isDocumentMetadata;
	}

	private discoverDocuments(
		previous: Record<string, DocumentRecord>,
		issues: IndexIssue[],
	): Record<string, DocumentRecord> {
		const documents: Record<string, DocumentRecord> = {};
		for (const [id, document] of Object.entries(previous)) {
			documents[id] = { ...document, exists: false };
		}

		for (const note of this.getMarkdownFiles()) {
			const id = this.readDocumentId(note);
			if (!id) continue;
			const existing = documents[id];
			if (existing?.exists && existing.path !== note.path) {
				issues.push({
					id: createId(),
					kind: 'duplicate-document-id',
					path: note.path,
					detail: `Document UUID is also used by ${existing.path}.`,
				});
				continue;
			}
			documents[id] = { id, path: note.path, exists: true };
		}
		return documents;
	}

	private buildReferenceSnapshot(): Record<string, Record<string, number>> {
		const snapshot: Record<string, Record<string, number>> = {};
		for (const [sourcePath, destinations] of Object.entries(
			this.app.metadataCache.resolvedLinks,
		)) {
			if (!sourcePath.toLocaleLowerCase().endsWith('.md')) continue;
			for (const [destinationPath, count] of Object.entries(
				destinations,
			)) {
				const destination =
					this.app.vault.getFileByPath(destinationPath);
				if (!destination || destination.extension === 'md') continue;
				(snapshot[destinationPath] ??= {})[sourcePath] = count;
			}
		}
		return snapshot;
	}

	private inferOwnerFromPath(
		attachmentPath: string,
		documents: Record<string, DocumentRecord>,
	): DocumentRecord | null {
		const folder = parentPath(attachmentPath);
		const matches = Object.values(documents).filter(
			(document) =>
				document.exists &&
				expectedAttachmentFolder(document.path, document.id) === folder,
		);
		return matches.length === 1 ? (matches[0] ?? null) : null;
	}

	private referencesForPath(path: string): Record<string, number> {
		return this.buildReferenceSnapshot()[path] ?? {};
	}

	private readDocumentId(note: TFile): string | null {
		const frontmatter =
			this.app.metadataCache.getFileCache(note)?.frontmatter;
		const value: unknown = frontmatter
			? Reflect.get(frontmatter, FRONTMATTER_ID_KEY)
			: undefined;
		return typeof value === 'string' && value.trim() ? value.trim() : null;
	}

	private async ensureDocument(
		note: TFile,
		documents = this.data.documents,
		issues = this.data.issues,
	): Promise<DocumentRecord | null> {
		let id = this.readDocumentId(note);
		if (id) {
			const duplicate = documents[id];
			if (duplicate?.exists && duplicate.path !== note.path) {
				issues.push({
					id: createId(),
					kind: 'duplicate-document-id',
					path: note.path,
					detail: `Document UUID is also used by ${duplicate.path}.`,
				});
				return null;
			}
		} else {
			id = createId();
			const nextId = id;
			await this.app.fileManager.processFrontMatter(
				note,
				(frontmatter: object) => {
					Reflect.set(frontmatter, FRONTMATTER_ID_KEY, nextId);
				},
			);
		}
		const document = { id, path: note.path, exists: true };
		documents[id] = document;
		return document;
	}

	private applyPathState(
		record: AttachmentRecord,
		owner: DocumentRecord,
		issues: IndexIssue[],
	): void {
		const expectedFolder = expectedAttachmentFolder(owner.path, owner.id);
		if (parentPath(record.path) === expectedFolder) {
			record.ownershipState = 'owned';
			delete record.issue;
			return;
		}
		record.ownershipState = 'needs-repair';
		record.issue = `Expected attachment folder: ${expectedFolder}`;
		issues.push({
			id: createId(),
			kind: 'path-drift',
			path: record.path,
			detail: record.issue,
		});
	}

	private async moveAttachmentToOwner(
		record: AttachmentRecord,
	): Promise<void> {
		if (!record.ownerDocumentId) return;
		const owner = this.data.documents[record.ownerDocumentId];
		const file = this.app.vault.getFileByPath(record.path);
		if (!owner?.exists || !file) return;
		const folder = expectedAttachmentFolder(owner.path, owner.id);
		if (parentPath(file.path) === folder) {
			record.ownershipState = 'owned';
			delete record.issue;
			return;
		}
		const previousFolder = parentPath(file.path);

		try {
			await this.ensureFolder(folder);
			const desiredPath = normalizePath(`${folder}/${file.name}`);
			const destination = this.findAvailablePath(desiredPath, file.path);
			await this.app.fileManager.renameFile(file, destination);
			record.path = destination;
			record.ownershipState = 'owned';
			delete record.issue;
		} catch (error) {
			record.ownershipState = 'needs-repair';
			record.issue =
				error instanceof Error ? error.message : String(error);
			this.data.issues.push({
				id: createId(),
				kind: 'move-failed',
				path: record.path,
				detail: record.issue,
			});
			return;
		}

		if (this.isManagedAttachmentFolder(previousFolder, owner.id)) {
			await this.removeEmptyManagedFolderSafely(previousFolder);
		}
	}

	private isManagedAttachmentFolder(
		folderPath: string,
		ownerDocumentId: string,
	): boolean {
		const segments = normalizePath(folderPath).split('/');
		return (
			segments[segments.length - 1] === ownerDocumentId &&
			segments[segments.length - 2] === 'assets'
		);
	}

	private async cleanupEmptyManagedFolders(): Promise<void> {
		const documentIds = new Set(Object.keys(this.data.documents));
		const folders = this.app.vault
			.getAllFolders(true)
			.slice()
			.sort((left, right) => right.path.length - left.path.length);
		for (const folder of folders) {
			const segments = normalizePath(folder.path).split('/');
			const documentId = segments[segments.length - 1];
			if (
				documentId &&
				documentIds.has(documentId) &&
				this.isManagedAttachmentFolder(folder.path, documentId)
			) {
				await this.removeEmptyManagedFolderSafely(folder.path);
			}
		}
	}

	private async removeEmptyManagedFolderSafely(
		folderPath: string,
	): Promise<void> {
		try {
			await this.removeEmptyManagedFolder(folderPath);
		} catch (error) {
			this.data.issues.push({
				id: createId(),
				kind: 'cleanup-failed',
				path: folderPath,
				detail: error instanceof Error ? error.message : String(error),
			});
		}
	}

	private async removeEmptyManagedFolder(folderPath: string): Promise<void> {
		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		if (!(folder instanceof TFolder) || folder.children.length > 0) return;
		await this.app.fileManager.trashFile(folder);

		const assetsPath = parentPath(folderPath);
		const assetsFolder = this.app.vault.getAbstractFileByPath(assetsPath);
		if (
			assetsFolder instanceof TFolder &&
			assetsFolder.name === 'assets' &&
			assetsFolder.children.length === 0
		) {
			await this.app.fileManager.trashFile(assetsFolder);
		}
	}

	private findAvailablePath(
		desiredPath: string,
		currentPath: string,
	): string {
		for (let attempt = 0; attempt < 10_000; attempt += 1) {
			const candidate = appendNumericSuffix(desiredPath, attempt);
			const existing = this.app.vault.getAbstractFileByPath(candidate);
			if (!existing || existing.path === currentPath) return candidate;
		}
		throw new Error(
			`Unable to find an available destination for ${desiredPath}`,
		);
	}

	private async ensureFolder(folderPath: string): Promise<void> {
		let current = '';
		for (const segment of normalizePath(folderPath).split('/')) {
			if (!segment) continue;
			current = current ? `${current}/${segment}` : segment;
			const existing = this.app.vault.getAbstractFileByPath(current);
			if (existing instanceof TFolder) continue;
			if (existing)
				throw new Error(`${current} exists and is not a folder.`);
			await this.app.vault.createFolder(current);
		}
	}

	private async handleRename(
		file: TAbstractFile,
		oldPath: string,
	): Promise<void> {
		if (!(file instanceof TFile)) return;
		if (file.extension === 'md') {
			const document = Object.values(this.data.documents).find(
				(candidate) => candidate.path === oldPath,
			);
			if (!document) {
				this.scheduleReconcile();
				return;
			}
			const oldParent = parentPath(oldPath);
			document.path = file.path;
			document.exists = true;
			for (const sources of Object.values(this.data.references)) {
				if (sources[oldPath] === undefined) continue;
				sources[file.path] = sources[oldPath];
				delete sources[oldPath];
			}
			if (oldParent !== parentPath(file.path)) {
				for (const attachment of Object.values(this.data.attachments)) {
					if (attachment.ownerDocumentId === document.id) {
						await this.moveAttachmentToOwner(attachment);
					}
				}
			}
		} else {
			const attachment = Object.values(this.data.attachments).find(
				(candidate) => candidate.path === oldPath,
			);
			if (attachment) attachment.path = file.path;
		}
		await this.saveAndNotify();
		this.scheduleReconcile();
	}

	private async handleDelete(file: TAbstractFile): Promise<void> {
		if (!(file instanceof TFile)) return;
		if (file.extension === 'md') {
			const document = Object.values(this.data.documents).find(
				(candidate) => candidate.path === file.path,
			);
			if (document) {
				document.exists = false;
				for (const attachment of Object.values(this.data.attachments)) {
					if (attachment.ownerDocumentId === document.id) {
						attachment.ownershipState = 'owner-missing';
					}
				}
			}
		} else {
			const entry = Object.entries(this.data.attachments).find(
				([, attachment]) => attachment.path === file.path,
			);
			if (entry) {
				delete this.data.attachments[entry[0]];
				delete this.data.references[entry[0]];
			}
		}
		await this.saveAndNotify();
		this.scheduleReconcile();
	}

	private async saveAndNotify(): Promise<void> {
		await this.persistData(this.data);
		for (const listener of this.listeners) listener();
	}
}
