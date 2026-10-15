# Note Steward

Note Steward is a local-first Obsidian plugin that gives every attachment a persistent owner note, tracks every reference, moves owned attachments with their note, and provides focused document and attachment overlays for review and cleanup.

Note Steward 是一个本地优先的 Obsidian 插件。它为附件记录稳定的 owner 文档、追踪全部引用、在 owner 文档移动时同步迁移附件，并提供安全的附件 Review 与清理界面。

## Features / 功能

- Persistent ownership independent of the current folder layout / 不依赖当前目录结构的持久化所有权
- Attachment buckets at `<note folder>/assets/<note-steward-id>/` / 基于文档 UUID 的附件目录
- Shared-reference tracking with per-note occurrence counts / 共享附件及逐文档引用次数
- Owner-aware moves with automatic link updates / owner 移动时自动迁移并更新链接
- Tree-style document ownership view / 树型文档所有权视图
- Attachment reference view with search, filters, and sorting / 带搜索、筛选与排序的附件引用视图
- Confirmed, trash-based single and bulk cleanup / 带确认且进入回收站的单个和批量清理
- Full index rebuild, attachment relocation, and folder cleanup / 完整重建索引、归位附件并清理目录
- English and Simplified Chinese UI / 英文与简体中文界面

The plugin runs entirely inside the vault. It makes no network requests, collects no telemetry, and uses Obsidian's configured trash behavior for deletion.

插件完全在本地仓库内运行，不发起网络请求、不收集遥测；删除操作遵循 Obsidian 已配置的回收站行为。

## Commands / 命令

- Open document view / 打开文档视图
- Open attachment view / 打开附件视图
- Rebuild attachment index / 重建附件索引

## Development / 开发

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Validation:

```bash
npm run format:check
npm run lint
npm test
npm run build
```

For manual installation, copy `main.js`, `manifest.json`, and `styles.css` into `<Vault>/.obsidian/plugins/note-steward/`.

手动安装时，将 `main.js`、`manifest.json` 和 `styles.css` 复制到 `<Vault>/.obsidian/plugins/note-steward/`。
