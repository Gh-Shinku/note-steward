import { moment } from 'obsidian';
import { LocaleSetting } from './types';

const en = {
	documentViewTitle: 'Documents and attachments',
	attachmentViewTitle: 'Attachment references',
	openDocumentView: 'Open document view',
	openAttachmentView: 'Open attachment view',
	repairIndex: 'Repair attachment index',
	rebuildIndex: 'Rebuild attachment index',
	all: 'All',
	zeroReferences: 'Zero references',
	referenced: 'Referenced',
	shared: 'Shared',
	owned: 'Owned',
	unclaimed: 'Unclaimed',
	ownerMissing: 'Owner missing',
	needsRepair: 'Needs repair',
	searchDocuments: 'Search documents and attachments',
	searchAttachments: 'Search attachments, owners, and references',
	referenceFilter: 'Reference status',
	ownershipFilter: 'Ownership status',
	fileType: 'File type',
	sort: 'Sort',
	sortReferencesAscending: 'References: low to high',
	sortReferencesDescending: 'References: high to low',
	sortNameAscending: 'Name: A to Z',
	sortPathAscending: 'Path: A to Z',
	owner: 'Owner',
	references: 'References',
	referenceDocuments: 'Reference documents',
	selectVisible: 'Select current results',
	clearSelection: 'Clear selection',
	deleteSelected: 'Delete selected',
	selected: (count: number) => `${count} selected`,
	documentCount: (count: number) => `${count} document(s)`,
	attachmentCount: (count: number) => `${count} attachment(s)`,
	noDocuments: 'No documents match this search.',
	noAttachments: 'No attachments match these filters.',
	confirmDelete: 'Confirm attachment deletion',
	confirmSingle: 'This attachment has zero references. Move it to trash?',
	confirmBulk: 'Move all listed zero-reference attachments to trash?',
	confirmCheck:
		'I reviewed the paths and understand these files will be moved to trash.',
	cancel: 'Cancel',
	confirm: 'Move to trash',
	rebuildDone: 'Attachment index rebuilt.',
	repairDone: 'Attachment index repaired.',
	deletedCount: (count: number) => `${count} attachment(s) moved to trash.`,
	skippedCount: (count: number) =>
		`${count} attachment(s) skipped because references changed.`,
	settingsTitle: 'Note Steward',
	language: 'Language',
	languageDesc: 'Choose the language used by Note Steward.',
	auto: 'Follow Obsidian',
	english: 'English',
	chinese: '简体中文',
	unknownOwner: 'Not assigned',
	operationFailed:
		'Note Steward could not complete the operation. Check the console for details.',
} as const;

export type Translation = {
	[Key in keyof typeof en]: (typeof en)[Key] extends (
		...args: infer Args
	) => string
		? (...args: Args) => string
		: string;
};

const zh: Translation = {
	...en,
	documentViewTitle: '文档与附件',
	attachmentViewTitle: '附件引用',
	openDocumentView: '打开文档视图',
	openAttachmentView: '打开附件视图',
	repairIndex: '修复附件索引',
	rebuildIndex: '重建附件索引',
	all: '全部',
	zeroReferences: '零引用',
	referenced: '有引用',
	shared: '共享附件',
	owned: '已认领',
	unclaimed: '待认领',
	ownerMissing: 'Owner 缺失',
	needsRepair: '需要修复',
	searchDocuments: '搜索文档和附件',
	searchAttachments: '搜索附件、Owner 和引用来源',
	referenceFilter: '引用状态',
	ownershipFilter: '所有权状态',
	fileType: '文件类型',
	sort: '排序',
	sortReferencesAscending: '引用数：从低到高',
	sortReferencesDescending: '引用数：从高到低',
	sortNameAscending: '名称：A 到 Z',
	sortPathAscending: '路径：A 到 Z',
	owner: 'Owner',
	references: '引用',
	referenceDocuments: '引用文档',
	selectVisible: '选择当前结果',
	clearSelection: '清除选择',
	deleteSelected: '删除已选择',
	selected: (count) => `已选择 ${count} 个`,
	documentCount: (count) => `${count} 个文档`,
	attachmentCount: (count) => `${count} 个附件`,
	noDocuments: '没有符合搜索条件的文档。',
	noAttachments: '没有符合当前筛选条件的附件。',
	confirmDelete: '确认删除附件',
	confirmSingle: '此附件当前为零引用，是否移到回收站？',
	confirmBulk: '是否将列出的零引用附件全部移到回收站？',
	confirmCheck: '我已核对路径，并理解这些文件将被移到回收站。',
	cancel: '取消',
	confirm: '移到回收站',
	rebuildDone: '附件索引已重建。',
	repairDone: '附件索引已修复。',
	deletedCount: (count) => `已将 ${count} 个附件移到回收站。`,
	skippedCount: (count) => `有 ${count} 个附件因引用变化而跳过。`,
	settingsTitle: 'Note Steward',
	language: '界面语言',
	languageDesc: '选择 Note Steward 使用的语言。',
	auto: '跟随 Obsidian',
	english: 'English',
	chinese: '简体中文',
	unknownOwner: '未指定',
	operationFailed: 'Note Steward 无法完成操作，请在控制台查看详情。',
};

export function resolveLocale(setting: LocaleSetting): 'en' | 'zh-CN' {
	if (setting !== 'auto') return setting;
	return moment.locale().toLocaleLowerCase().startsWith('zh')
		? 'zh-CN'
		: 'en';
}

export function translations(setting: LocaleSetting): Translation {
	return resolveLocale(setting) === 'zh-CN' ? zh : en;
}
