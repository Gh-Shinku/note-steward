export class TAbstractFile {
	path = '';
	name = '';
	parent = null;
}

export class TFile extends TAbstractFile {
	stat = { ctime: 0, mtime: 0, size: 0 };
	basename = '';
	extension = '';
}

export class TFolder extends TAbstractFile {
	children: TAbstractFile[] = [];

	isRoot(): boolean {
		return this.path === '';
	}
}

export function normalizePath(path: string): string {
	return path
		.replaceAll('\\', '/')
		.replaceAll(/\/{2,}/g, '/')
		.replace(/^\//, '');
}
