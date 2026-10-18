# Note Steward

Note Steward is a local-first Obsidian plugin for managing attachment ownership. It gives attachments a persistent owner note, tracks every reference, moves owned attachments with their owner, and provides focused document and attachment views for review and cleanup.

The plugin works on desktop and mobile, makes no network requests, and collects no telemetry.

## Features

- Persistent attachment ownership that does not depend on the current folder structure
- Stable note identities stored in the plugin's local data
- Per-note attachment folders at `<note folder>/assets/<document UUID>/`
- Automatic attachment migration when an owner note moves
- Shared attachment tracking with per-note and total reference counts
- Silent first-claim migration while editing, with standard Obsidian link updates for later moves
- Tree-style document view for browsing attachments by owner note
- Attachment view with search, reference filters, ownership filters, file-type filters, and sorting
- Identification and multi-selection of zero-reference attachments
- Confirmed cleanup through Obsidian's configured trash behavior
- Index rebuilding, attachment relocation, and empty managed-folder cleanup
- English and Simplified Chinese interface languages

## Ownership model

Only Markdown files can own or reference attachments. Eligible non-Markdown vault files are tracked as attachments; internal document metadata sidecars are excluded.

When an unowned attachment gains its first reference from a single note, Note Steward assigns that note as the owner and moves the attachment into the note's UUID-based attachment folder. If that note is currently being edited, Note Steward updates its links in one editor transaction so the move does not reload the note or produce Obsidian link-update notices. Later references from other notes do not change the owner. If the owner note moves to another folder, its attachments move with it and Obsidian updates all links, including links from other notes.

New note UUIDs are stored only in Note Steward's plugin data. Existing `note-steward-id` frontmatter properties are left untouched and remain available as legacy recovery information, but the plugin does not add the property to newly claimed notes. If the plugin data file is lost, ownership created under this data-only model cannot always be recovered automatically.

Removing the last reference does not delete the attachment or clear its ownership. The attachment remains available as a zero-reference item until you explicitly move it to the trash.

## Commands

| Command                  | Command ID                          | Description                                                                                                         |
| ------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Open document view       | `note-steward:open-document-view`   | Browse owner notes and their attachments. If a Markdown note is active, the view opens filtered to that note.       |
| Open attachment view     | `note-steward:open-attachment-view` | Review attachment ownership, references, file types, and zero-reference items.                                      |
| Rebuild attachment index | `note-steward:rebuild-index`        | Rebuild references, preserve trustworthy ownership, relocate owned attachments, and clean up empty managed folders. |

## Manual installation

Note Steward requires Obsidian 1.6.6 or newer.

1. Build the plugin as described below.
2. Create `<Vault>/.obsidian/plugins/note-steward/`.
3. Copy `main.js`, `manifest.json`, and `styles.css` into that directory.
4. Reload Obsidian.
5. Enable **Note Steward** under **Settings → Community plugins**.

## Development

Node.js 20 or newer and npm are required.

```bash
npm install
npm run dev
```

Run the complete validation suite before submitting changes:

```bash
npm run format:check
npm run lint
npm test
npm run build
```

The production build writes `main.js` to the project root. Generated build artifacts and `node_modules/` are not committed.

## Data and privacy

Ownership and reference indexes are stored in the plugin's local Obsidian data file. Note Steward reads and modifies files only inside the active vault. It does not use external services, make network requests, collect telemetry, or transmit vault contents.

Deletion always requires confirmation and uses Obsidian's configured trash behavior. Attachments that gain references before deletion are skipped.

## License

[MIT](LICENSE)
