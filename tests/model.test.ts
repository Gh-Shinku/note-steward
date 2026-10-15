import { describe, expect, it } from 'vitest';
import {
	appendNumericSuffix,
	createEmptyData,
	expectedAttachmentFolder,
	filterAndSortAttachments,
	filterDocumentTree,
	hydrateData,
	shouldAutoClaim,
	sumReferenceCounts,
} from '../src/core/model';
import {
	AttachmentRecord,
	AttachmentViewFilter,
	DocumentTreeItem,
	ReviewItem,
} from '../src/types';

const attachment: AttachmentRecord = {
	id: 'asset-1',
	path: 'files/image.png',
	ownerDocumentId: null,
	ownershipState: 'unclaimed',
	firstSeenAt: 1,
	claimBlocked: false,
};

const baseFilter: AttachmentViewFilter = {
	query: '',
	reference: 'all',
	ownership: 'all',
	extension: '',
	sort: 'references-asc',
};

const items: ReviewItem[] = [
	{
		id: 'one',
		path: 'Projects/assets/id/image.png',
		name: 'image.png',
		extension: 'png',
		size: 100,
		ownerDocumentId: 'doc',
		ownerPath: 'Projects/Plan.md',
		ownershipState: 'owned',
		totalReferences: 0,
		references: [],
	},
	{
		id: 'two',
		path: 'Shared/report.pdf',
		name: 'report.pdf',
		extension: 'pdf',
		size: 200,
		ownerDocumentId: null,
		ownerPath: null,
		ownershipState: 'unclaimed',
		totalReferences: 3,
		references: [
			{ path: 'A.md', count: 1 },
			{ path: 'B.md', count: 2 },
		],
	},
];

describe('ownership decisions', () => {
	it('automatically claims a new attachment with exactly one source', () => {
		expect(shouldAutoClaim(undefined, { 'Note.md': 1 })).toBe(true);
	});

	it('does not guess an owner when multiple sources exist', () => {
		expect(shouldAutoClaim(undefined, { 'A.md': 1, 'B.md': 1 })).toBe(
			false,
		);
	});

	it('keeps a manually blocked attachment unclaimed', () => {
		expect(
			shouldAutoClaim(
				{ ...attachment, claimBlocked: true },
				{ 'A.md': 1 },
			),
		).toBe(false);
	});

	it('counts repeated references from all source notes', () => {
		expect(sumReferenceCounts({ 'A.md': 2, 'B.md': 3 })).toBe(5);
	});
});

describe('paths', () => {
	it('uses the stable document UUID below the note folder', () => {
		expect(expectedAttachmentFolder('Projects/Plan.md', 'doc-id')).toBe(
			'Projects/assets/doc-id',
		);
	});

	it('handles notes in the vault root', () => {
		expect(expectedAttachmentFolder('Plan.md', 'doc-id')).toBe(
			'assets/doc-id',
		);
	});

	it('adds deterministic suffixes without losing extensions', () => {
		expect(appendNumericSuffix('assets/image.png', 2)).toBe(
			'assets/image-2.png',
		);
		expect(appendNumericSuffix('assets/LICENSE', 2)).toBe(
			'assets/LICENSE-2',
		);
	});
});

describe('review filters', () => {
	it('finds zero-reference attachments', () => {
		expect(
			filterAndSortAttachments(items, {
				...baseFilter,
				reference: 'zero',
			}),
		).toHaveLength(1);
	});

	it('finds referenced, shared, and ownership states', () => {
		expect(
			filterAndSortAttachments(items, {
				...baseFilter,
				reference: 'referenced',
			})[0]?.id,
		).toBe('two');
		expect(
			filterAndSortAttachments(items, {
				...baseFilter,
				reference: 'shared',
			})[0]?.id,
		).toBe('two');
		expect(
			filterAndSortAttachments(items, {
				...baseFilter,
				ownership: 'unclaimed',
			})[0]?.id,
		).toBe('two');
	});

	it('searches attachment, owner, and reference source paths', () => {
		expect(
			filterAndSortAttachments(items, {
				...baseFilter,
				query: 'Plan.md',
			}),
		).toHaveLength(1);
		expect(
			filterAndSortAttachments(items, {
				...baseFilter,
				query: 'B.md',
			}),
		).toEqual([items[1]]);
	});

	it('filters by extension and sorts in all supported orders', () => {
		expect(
			filterAndSortAttachments(items, {
				...baseFilter,
				extension: 'pdf',
			}),
		).toEqual([items[1]]);
		expect(
			filterAndSortAttachments(items, {
				...baseFilter,
				sort: 'references-desc',
			}).map((item) => item.id),
		).toEqual(['two', 'one']);
		expect(
			filterAndSortAttachments(items, {
				...baseFilter,
				sort: 'name-asc',
			}).map((item) => item.id),
		).toEqual(['one', 'two']);
		expect(
			filterAndSortAttachments(items, {
				...baseFilter,
				sort: 'path-asc',
			}).map((item) => item.id),
		).toEqual(['one', 'two']);
	});
});

describe('document tree', () => {
	const tree: DocumentTreeItem[] = [
		{
			documentId: 'doc-1',
			path: 'Projects/计划.md',
			name: '计划.md',
			attachments: [items[0] as ReviewItem],
		},
		{
			documentId: 'doc-2',
			path: 'Reports/Report.md',
			name: 'Report.md',
			attachments: [items[1] as ReviewItem],
		},
	];

	it('keeps every attachment when the document matches', () => {
		expect(filterDocumentTree(tree, '计划')).toEqual([tree[0]]);
	});

	it('keeps the parent but only matching attachments for attachment searches', () => {
		const result = filterDocumentTree(tree, 'report.pdf');
		expect(result).toHaveLength(1);
		expect(result[0]?.path).toBe('Reports/Report.md');
		expect(result[0]?.attachments).toEqual([items[1]]);
	});

	it('returns an empty tree when nothing matches', () => {
		expect(filterDocumentTree(tree, 'missing')).toEqual([]);
	});
});

describe('persistence', () => {
	it('hydrates missing fields and keeps ownership records', () => {
		const hydrated = hydrateData({
			attachments: { 'asset-1': attachment },
		});
		expect(hydrated.attachments['asset-1']?.path).toBe('files/image.png');
		expect(hydrated.settings.locale).toBe('auto');
	});

	it('creates independent empty snapshots', () => {
		const first = createEmptyData();
		first.settings.locale = 'zh-CN';
		expect(createEmptyData().settings.locale).toBe('auto');
	});
});
