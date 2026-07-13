# Notebook Cell Support Design

## Goal

Scan annotations in every cell of an opened VS Code notebook and make them
available through the existing store, Explorer, diagnostics, CodeLens, and
editor decorations without parsing notebook files or relying on local file
system APIs.

## Scope

- Support every opened `NotebookDocument`, including notebooks backed by
  remote or virtual file systems.
- Scan all current cells when a notebook opens, and cells already present when
  the extension activates.
- Incrementally scan added cells and cell document changes.
- Remove annotations for cells that are removed or whose notebook closes.
- Reuse the existing text-document scanner, annotation identity, and state
  persistence. No separate notebook index or `.ipynb` parser is introduced.

## Alternatives

1. Parse discoverable `.ipynb` files during workspace scans. This would need
   format-specific parsing, miss custom notebook types, and weaken Web/virtual
   workspace support. Rejected.
2. Treat notebook cells as text documents and coordinate their lifecycle with
   `workspace.notebookDocuments` and notebook events. This is the recommended
   approach because VS Code supplies each cell's URI, language, and text.
3. Depend only on existing text-document change events. That misses unchanged
   cells when a notebook opens and cannot reliably clear removed cell results.
   Rejected.

## Architecture

`useBeaconHighlight()` remains the sole owner of text scanning and returns its
existing `scanTextDocument(document, source)` capability. A new
`useBeaconNotebook()` coordinator consumes that capability with source
`notebook`.

The coordinator maintains `Map<notebook URI, Set<cell URI>>` only for cleanup.
It scans the cells of notebooks already open at activation and on
`onDidOpenNotebookDocument`. On `onDidChangeNotebookDocument`, it scans added
cells, removes entries for removed cells, and lets the existing text-document
listener handle text edits. On `onDidCloseNotebookDocument`, it removes the
tracked cell annotations. It neither reads notebook files nor creates editors.

Existing store subscribers provide Explorer refresh, diagnostics publishing,
CodeLens lookup, and decoration refresh. The CodeLens selector already accepts
all document schemes, and `workspace.textDocuments` includes open cell
documents for open-file diagnostics.

## Error Handling and Consistency

- The coordinator makes only synchronous calls over supplied notebook cells;
  it has no pending I/O results that can overwrite newer content.
- A removed cell is deleted by its immutable cell-document URI. Closing a
  notebook clears only URIs that the coordinator recorded for that notebook.
- The normal scanner enforces `code-beacon.enable`, configured languages,
  comment-only behavior, rule validation, and workspace-trust regex policy.
- The new behavior follows existing scan-mode semantics: `manual` performs no
  automatic notebook scan; other modes include opened notebooks so that their
  cells participate in the selected automatic workflow.

## Testing

Unit tests with mocked VS Code notebook events will prove that the coordinator:

1. scans cells from notebooks present at activation;
2. scans a newly opened notebook and added cells;
3. clears removed-cell and closed-notebook results without touching another
   notebook; and
4. respects manual scan mode.

The extension-host smoke test will be extended with an in-memory notebook to
prove a real cell annotation reaches the shared store through the public API.

## References

VS Code exposes `workspace.onDidOpenNotebookDocument`,
`onDidChangeNotebookDocument`, and `onDidCloseNotebookDocument`; notebook
change events explicitly identify added and removed cells, and every
`NotebookCell` exposes a `TextDocument`. [VS Code API](https://code.visualstudio.com/api/references/vscode-api)
