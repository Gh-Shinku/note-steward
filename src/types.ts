export const DATA_SCHEMA_VERSION = 1;
export const FRONTMATTER_ID_KEY = 'note-steward-id';

export type LocaleSetting = 'auto' | 'en' | 'zh-CN';

export interface NoteStewardSettings {
	locale: LocaleSetting;
}

export interface DocumentRecord {
	id: string;
	path: string;
	exists: boolean;
}

export type OwnershipState =
	'owned' | 'unclaimed' | 'owner-missing' | 'needs-repair';

export interface AttachmentRecord {
	id: string;
	path: string;
	ownerDocumentId: string | null;
	ownershipState: OwnershipState;
	firstSeenAt: number;
	claimedAt?: number;
	claimBlocked: boolean;
	issue?: string;
}

export interface IndexIssue {
	id: string;
	kind:
		'duplicate-document-id' | 'missing-file' | 'path-drift' | 'move-failed';
	path: string;
	detail: string;
}

export interface NoteStewardData {
	schemaVersion: number;
	settings: NoteStewardSettings;
	documents: Record<string, DocumentRecord>;
	attachments: Record<string, AttachmentRecord>;
	references: Record<string, Record<string, number>>;
	issues: IndexIssue[];
	lastIndexedAt: number | null;
}

export interface ReferenceSource {
	path: string;
	count: number;
}

export interface ReviewItem {
	id: string;
	path: string;
	name: string;
	extension: string;
	size: number;
	ownerDocumentId: string | null;
	ownerPath: string | null;
	ownershipState: OwnershipState;
	totalReferences: number;
	references: ReferenceSource[];
	issue?: string;
}

export type ReviewStatus =
	| 'all'
	| 'orphaned'
	| 'shared'
	| 'unclaimed'
	| 'owner-missing'
	| 'needs-repair';

export type ReviewScope = 'vault' | 'current-note' | 'folder';

export interface ReviewFilter {
	query: string;
	status: ReviewStatus;
	extension: string;
	scope: ReviewScope;
	currentNotePath: string | null;
	folderPath: string;
	ownerPath: string | null;
}
