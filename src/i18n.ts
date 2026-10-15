import { moment } from 'obsidian';
import { LocaleSetting } from './types';

const en = {
	reviewTitle: 'Attachment review',
	openReview: 'Open attachment review',
	reviewCurrent: 'Review attachments owned by current note',
	repairIndex: 'Repair attachment index',
	rebuildIndex: 'Rebuild attachment index',
	all: 'All',
	orphaned: 'Zero references',
	shared: 'Shared',
	unclaimed: 'Unclaimed',
	ownerMissing: 'Owner missing',
	needsRepair: 'Needs repair',
	search: 'Search attachments',
	vault: 'Entire vault',
	currentNote: 'Current note',
	folder: 'Folder',
	type: 'File type',
	status: 'Status',
	scope: 'Scope',
	owner: 'Owner',
	references: 'References',
	open: 'Open',
	claim: 'Assign owner',
	delete: 'Move to trash',
	deleteVisible: 'Delete visible zero-reference attachments',
	refresh: 'Refresh',
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
	indexed: (count: number) => `${count} attachment(s) indexed`,
	unknownOwner: 'Not assigned',
	viewOwned: 'Review owned attachments',
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
	reviewTitle: '附件 Review',
	openReview: '打开附件 Review',
	reviewCurrent: '查看当前文档拥有的附件',
	repairIndex: '修复附件索引',
	rebuildIndex: '重建附件索引',
	all: '全部',
	orphaned: '零引用',
	shared: '共享附件',
	unclaimed: '待认领',
	ownerMissing: 'Owner 缺失',
	needsRepair: '需要修复',
	search: '搜索附件',
	vault: '整个仓库',
	currentNote: '当前文档',
	folder: '文件夹',
	type: '文件类型',
	status: '状态',
	scope: '范围',
	owner: 'Owner',
	references: '引用',
	open: '打开',
	claim: '指定 Owner',
	delete: '移到回收站',
	deleteVisible: '删除当前范围内的零引用附件',
	refresh: '刷新',
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
	indexed: (count) => `已索引 ${count} 个附件`,
	unknownOwner: '未指定',
	viewOwned: '查看拥有的附件',
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
