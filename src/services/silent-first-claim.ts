import { parseLinktext } from 'obsidian';
import type {
	App,
	Editor,
	EditorChange,
	ReferenceCache,
	TFile,
} from 'obsidian';

interface LinkOccurrence {
	reference: ReferenceCache;
	isEmbed: boolean;
}

export interface SilentFirstClaimOptions {
	app: App;
	source: TFile;
	attachment: TFile;
	destination: string;
	expectedReferenceCount: number;
	rename: (file: TFile, destination: string) => Promise<void>;
}

export type SilentFirstClaimResult =
	{ moved: true } | { moved: false; reason: string };

export async function moveFirstClaimSilently(
	options: SilentFirstClaimOptions,
): Promise<SilentFirstClaimResult> {
	const editorInfo = options.app.workspace.activeEditor;
	const editor = editorInfo?.editor;
	if (editorInfo?.file?.path !== options.source.path || !editor) {
		return { moved: false, reason: 'The source note is not being edited.' };
	}

	const occurrences = collectOccurrences(
		options.app,
		options.source,
		options.attachment,
	);
	if (occurrences.length !== options.expectedReferenceCount) {
		return {
			moved: false,
			reason: 'The active editor link cache is incomplete.',
		};
	}
	const validationError = validateOccurrences(editor, occurrences);
	if (validationError) return { moved: false, reason: validationError };

	const originalPath = options.attachment.path;
	await options.rename(options.attachment, options.destination);
	try {
		const postMoveError = validateOccurrences(editor, occurrences);
		if (postMoveError) throw new Error(postMoveError);
		const changes = occurrences.map((occurrence) =>
			createEditorChange(
				options.app,
				options.source,
				options.attachment,
				occurrence,
			),
		);
		editor.transaction({ changes }, 'note-steward');
		return { moved: true };
	} catch (error) {
		try {
			await options.rename(options.attachment, originalPath);
		} catch (rollbackError) {
			throw new AggregateError(
				[error, rollbackError],
				`Silent attachment migration failed and could not restore ${originalPath}.`,
			);
		}
		throw error;
	}
}

function collectOccurrences(
	app: App,
	source: TFile,
	attachment: TFile,
): LinkOccurrence[] {
	const cache = app.metadataCache.getFileCache(source);
	const candidates = [
		...(cache?.links ?? []).map((reference) => ({
			reference,
			isEmbed: false,
		})),
		...(cache?.embeds ?? []).map((reference) => ({
			reference,
			isEmbed: true,
		})),
	];
	return candidates
		.filter(
			({ reference }) =>
				app.metadataCache.getFirstLinkpathDest(
					reference.link,
					source.path,
				)?.path === attachment.path,
		)
		.sort(
			(left, right) =>
				right.reference.position.start.offset -
				left.reference.position.start.offset,
		);
}

function validateOccurrences(
	editor: Editor,
	occurrences: LinkOccurrence[],
): string | null {
	let nextStart = Number.POSITIVE_INFINITY;
	for (const { reference } of occurrences) {
		if (reference.position.end.offset > nextStart) {
			return 'Attachment link ranges overlap.';
		}
		const current = editor.getRange(
			{
				line: reference.position.start.line,
				ch: reference.position.start.col,
			},
			{
				line: reference.position.end.line,
				ch: reference.position.end.col,
			},
		);
		if (current !== reference.original) {
			return 'The active editor changed while the attachment was moving.';
		}
		nextStart = reference.position.start.offset;
	}
	return null;
}

function createEditorChange(
	app: App,
	source: TFile,
	attachment: TFile,
	occurrence: LinkOccurrence,
): EditorChange {
	const { reference, isEmbed } = occurrence;
	const { subpath } = parseLinktext(reference.link);
	const alias = getAlias(reference);
	const link = app.fileManager.generateMarkdownLink(
		attachment,
		source.path,
		subpath,
		alias,
	);
	return {
		text: isEmbed ? `!${link}` : link,
		from: {
			line: reference.position.start.line,
			ch: reference.position.start.col,
		},
		to: {
			line: reference.position.end.line,
			ch: reference.position.end.col,
		},
	};
}

function getAlias(reference: ReferenceCache): string | undefined {
	const original = reference.original.startsWith('!')
		? reference.original.slice(1)
		: reference.original;
	if (original.startsWith('[[')) {
		return original.slice(2, -2).includes('|')
			? (reference.displayText ?? '')
			: undefined;
	}
	return reference.displayText ?? '';
}
