import { describe, expect, it } from 'vitest';
import {
	appendNumericSuffix,
	createEmptyData,
	expectedAttachmentFolder,
	filterReviewItems,
	hydrateData,
	shouldAutoClaim,
	sumReferenceCounts,
} from '../src/core/model';
import { AttachmentRecord, ReviewFilter, ReviewItem } from '../src/types';

const attachment: AttachmentRecord = {
	id: 'asset-1',
	path: 'files/image.png',
	ownerDocumentId: null,
	ownershipState: 'unclaimed',
	firstSeenAt: 1,
	claimBlocked: false,
};

const baseFilter: ReviewFilter = {
	query: '',
	status: 'all',
	extension: '',
	scope: 'vault',
	currentNotePath: null,
	folderPath: '',
	ownerPath: null,
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
			filterReviewItems(items, { ...baseFilter, status: 'orphaned' }),
		).toHaveLength(1);
	});

	it('finds shared and unclaimed attachments', () => {
		expect(
			filterReviewItems(items, { ...baseFilter, status: 'shared' })[0]
				?.id,
		).toBe('two');
		expect(
			filterReviewItems(items, { ...baseFilter, status: 'unclaimed' })[0]
				?.id,
		).toBe('two');
	});

	it('scopes by owner folder and supports text search', () => {
		expect(
			filterReviewItems(items, {
				...baseFilter,
				scope: 'folder',
				folderPath: 'Projects',
				query: 'image',
			}),
		).toHaveLength(1);
	});

	it('scopes unclaimed attachments by their physical folder', () => {
		expect(
			filterReviewItems(items, {
				...baseFilter,
				scope: 'folder',
				folderPath: 'Shared',
			}),
		).toEqual([items[1]]);
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
