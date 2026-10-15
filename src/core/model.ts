import {
	AttachmentRecord,
	DATA_SCHEMA_VERSION,
	NoteStewardData,
	ReviewFilter,
	ReviewItem,
} from '../types';

export const DEFAULT_DATA: NoteStewardData = {
	schemaVersion: DATA_SCHEMA_VERSION,
	settings: { locale: 'auto' },
	documents: {},
	attachments: {},
	references: {},
	issues: [],
	lastIndexedAt: null,
};

export function createEmptyData(): NoteStewardData {
	return structuredClone(DEFAULT_DATA);
}

export function hydrateData(value: unknown): NoteStewardData {
	if (!isRecord(value)) return createEmptyData();

	const saved = value as Partial<NoteStewardData>;
	return {
		...createEmptyData(),
		...saved,
		settings: { ...DEFAULT_DATA.settings, ...saved.settings },
		documents: saved.documents ?? {},
		attachments: saved.attachments ?? {},
		references: saved.references ?? {},
		issues: saved.issues ?? [],
		schemaVersion: DATA_SCHEMA_VERSION,
	};
}

export function sumReferenceCounts(references: Record<string, number>): number {
	return Object.values(references).reduce((total, count) => total + count, 0);
}

export function shouldAutoClaim(
	record: AttachmentRecord | undefined,
	references: Record<string, number>,
): boolean {
	return (
		Object.keys(references).length === 1 &&
		(!record || (!record.ownerDocumentId && !record.claimBlocked))
	);
}

export function parentPath(path: string): string {
	const separator = path.lastIndexOf('/');
	return separator < 0 ? '' : path.slice(0, separator);
}

export function expectedAttachmentFolder(
	notePath: string,
	documentId: string,
): string {
	const parent = parentPath(notePath);
	return [parent, 'assets', documentId].filter(Boolean).join('/');
}

export function appendNumericSuffix(path: string, attempt: number): string {
	if (attempt < 1) return path;
	const slash = path.lastIndexOf('/');
	const directory = slash >= 0 ? path.slice(0, slash + 1) : '';
	const filename = slash >= 0 ? path.slice(slash + 1) : path;
	const dot = filename.lastIndexOf('.');
	if (dot <= 0) return `${directory}${filename}-${attempt}`;
	return `${directory}${filename.slice(0, dot)}-${attempt}${filename.slice(dot)}`;
}

export function filterReviewItems(
	items: ReviewItem[],
	filter: ReviewFilter,
): ReviewItem[] {
	const query = filter.query.trim().toLocaleLowerCase();
	return items.filter((item) => {
		if (
			query &&
			![item.name, item.path, item.ownerPath ?? ''].some((value) =>
				value.toLocaleLowerCase().includes(query),
			)
		) {
			return false;
		}

		if (filter.extension && item.extension !== filter.extension)
			return false;
		if (filter.ownerPath && item.ownerPath !== filter.ownerPath)
			return false;

		if (
			filter.scope === 'current-note' &&
			item.ownerPath !== filter.currentNotePath
		) {
			return false;
		}
		if (filter.scope === 'folder') {
			const prefix = filter.folderPath ? `${filter.folderPath}/` : '';
			if (prefix && !item.path.startsWith(prefix)) return false;
		}

		switch (filter.status) {
			case 'orphaned':
				return item.totalReferences === 0;
			case 'shared':
				return item.references.length > 1;
			case 'unclaimed':
				return item.ownershipState === 'unclaimed';
			case 'owner-missing':
				return item.ownershipState === 'owner-missing';
			case 'needs-repair':
				return (
					item.ownershipState === 'needs-repair' ||
					Boolean(item.issue)
				);
			case 'all':
				return true;
		}
	});
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
