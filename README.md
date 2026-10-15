# Note Steward

Note Steward is a local-first Obsidian plugin that gives every attachment a persistent owner note, tracks every reference, moves owned attachments with their note, and provides a safe review and cleanup workspace.

Note Steward 是一个本地优先的 Obsidian 插件。它为附件记录稳定的 owner 文档、追踪全部引用、在 owner 文档移动时同步迁移附件，并提供安全的附件 Review 与清理界面。

## Features / 功能

- Persistent ownership independent of the current folder layout / 不依赖当前目录结构的持久化所有权
- Attachment buckets at `<note folder>/assets/<note-steward-id>/` / 基于文档 UUID 的附件目录
- Shared-reference tracking with per-note occurrence counts / 共享附件及逐文档引用次数
- Owner-aware moves with automatic link updates / owner 移动时自动迁移并更新链接
- Image, audio, video, and PDF previews / 图片、音频、视频与 PDF 预览
- Filters for zero-reference, shared, unclaimed, missing-owner, and repair-needed files / 孤立、共享、待认领、owner 缺失及待修复筛选
- Confirmed, trash-based single and bulk cleanup / 带确认且进入回收站的单个和批量清理
- Full repair and rebuild commands / 索引修复与重建
- English and Simplified Chinese UI / 英文与简体中文界面

The plugin runs entirely inside the vault. It makes no network requests, collects no telemetry, and uses Obsidian's configured trash behavior for deletion.

插件完全在本地仓库内运行，不发起网络请求、不收集遥测；删除操作遵循 Obsidian 已配置的回收站行为。

## Commands / 命令

- Open attachment review / 打开附件 Review
- Review attachments owned by current note / 查看当前文档拥有的附件
- Repair attachment index / 修复附件索引
- Rebuild attachment index / 重建附件索引

You can also right-click a Markdown note and choose **Review owned attachments**.

也可以右键 Markdown 文档，选择 **查看拥有的附件**。

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
