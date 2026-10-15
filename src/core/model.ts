import {
	AttachmentRecord,
	AttachmentViewFilter,
	DATA_SCHEMA_VERSION,
	DocumentTreeItem,
	NoteStewardData,
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

export function shouldClaimDuringRebuild(
	record: AttachmentRecord,
	references: Record<string, number>,
): boolean {
	return (
		!record.ownerDocumentId &&
		record.ownershipState === 'unclaimed' &&
		Object.keys(references).length === 1 &&
		sumReferenceCounts(references) === 1
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

export function filterDocumentTree(
	items: DocumentTreeItem[],
	queryValue: string,
): DocumentTreeItem[] {
	const query = queryValue.trim().toLocaleLowerCase();
	if (!query) return items;

	return items.flatMap((document) => {
		const documentMatches = [document.name, document.path].some((value) =>
			value.toLocaleLowerCase().includes(query),
		);
		const attachments = documentMatches
			? document.attachments
			: document.attachments.filter((attachment) =>
					[attachment.name, attachment.path].some((value) =>
						value.toLocaleLowerCase().includes(query),
					),
				);
		return attachments.length > 0 ? [{ ...document, attachments }] : [];
	});
}

export function filterAndSortAttachments(
	items: ReviewItem[],
	filter: AttachmentViewFilter,
): ReviewItem[] {
	const query = filter.query.trim().toLocaleLowerCase();
	const filtered = items.filter((item) => {
		if (
			query &&
			![
				item.name,
				item.path,
				item.ownerPath ?? '',
				...item.references.map((reference) => reference.path),
			].some((value) => value.toLocaleLowerCase().includes(query))
		) {
			return false;
		}

		if (filter.extension && item.extension !== filter.extension)
			return false;
		if (
			filter.ownership !== 'all' &&
			item.ownershipState !== filter.ownership
		) {
			return false;
		}

		switch (filter.reference) {
			case 'zero':
				return item.totalReferences === 0;
			case 'referenced':
				return item.totalReferences > 0;
			case 'shared':
				return item.references.length > 1;
			case 'all':
				return true;
		}
	});

	return filtered.sort((left, right) => {
		switch (filter.sort) {
			case 'references-asc':
				return (
					left.totalReferences - right.totalReferences ||
					left.path.localeCompare(right.path)
				);
			case 'references-desc':
				return (
					right.totalReferences - left.totalReferences ||
					left.path.localeCompare(right.path)
				);
			case 'name-asc':
				return (
					left.name.localeCompare(right.name) ||
					left.path.localeCompare(right.path)
				);
			case 'path-asc':
				return left.path.localeCompare(right.path);
		}
	});
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
