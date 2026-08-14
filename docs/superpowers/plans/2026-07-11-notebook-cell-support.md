# Notebook Cell Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make annotations in opened notebook cells flow through AnnoPulse's existing store-backed user experience.

**Architecture:** `useAnnoPulseHighlight()` remains the one text-scanning implementation. `useAnnoPulseNotebook(scanTextDocument)` owns only notebook lifecycle bookkeeping, forwards cell documents to that scanner with source `notebook`, and clears recorded cell URIs when cells disappear. The shared annotation store continues to drive Explorer, diagnostics, decorations, and CodeLens.

**Tech Stack:** TypeScript, VS Code Extension API, reactive-vscode, Vitest, `@vscode/test-electron`.

## Global Constraints

- Use public VS Code Notebook and workspace APIs only; do not parse `.ipynb`, use Node file APIs, or invoke a shell.
- Support remote, web, and virtual workspace notebook providers through cell `TextDocument` objects.
- Reuse existing rule normalization, language filtering, comment-only behavior, and persistent annotation IDs.
- `annopulse.scanMode: manual` must not start an automatic notebook scan.
- Every behavioral change starts with a focused failing Vitest or extension-host assertion, then receives the minimum implementation needed to pass.

---

### Task 1: Coordinate opened notebook cell lifecycles

**Files:**

- Create: `src/composables/use-annotation-notebook.ts`
- Create: `tests/annotation-notebook.test.ts`

**Interfaces:**

- Consumes: `scanTextDocument(document: TextDocument, source: AnnoPulseAnnotation['source']): readonly AnnoPulseAnnotation[]` from `useAnnoPulseHighlight()`.
- Produces: `useAnnoPulseNotebook(scanTextDocument)`, which registers notebook listeners and returns `{ scanNotebook }` for integration tests.

- [ ] **Step 1: Write failing lifecycle tests**

Create a mocked `workspace` with `notebookDocuments`, and listener arrays for `onDidOpenNotebookDocument`, `onDidChangeNotebookDocument`, and `onDidCloseNotebookDocument`. Define cell documents with distinct URI strings. Assert the following public behavior:

```ts
it('scans cells in notebooks already open at activation', () => {
  notebookDocuments.push(
    notebook('file:///book.ipynb', [cell('vscode-notebook-cell:///a')]),
  )
  useAnnoPulseNotebook(scanTextDocument)

  expect(scanTextDocument).toHaveBeenCalledWith(cellA.document, 'notebook')
})

it('scans added cells and clears removed and closed notebook cells', () => {
  useAnnoPulseNotebook(scanTextDocument)
  openListener(notebookA)
  annotationStore.setForUri(cellA.document.uri.toString(), [annotation(cellA)])
  changeListener({
    cellChanges: [],
    contentChanges: [{ addedCells: [cellB], removedCells: [cellA], range: {} }],
    notebook: notebookA,
  })

  expect(scanTextDocument).toHaveBeenCalledWith(cellB.document, 'notebook')
  expect(
    annotationStore.getForUri(cellA.document.uri.toString()),
  ).toStrictEqual([])
  closeListener(notebookA)
  expect(
    annotationStore.getForUri(cellB.document.uri.toString()),
  ).toStrictEqual([])
})
```

Add a separate `manual` test that uses the same open listener and expects no scanner call.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm vitest tests/annotation-notebook.test.ts`

Expected: FAIL because `useAnnoPulseNotebook` does not exist.

- [ ] **Step 3: Implement the lifecycle coordinator**

Implement `src/composables/use-annotation-notebook.ts` with these exact operations:

```ts
export function useAnnoPulseNotebook(scanTextDocument: ScanTextDocument) {
  const cellsByNotebookUri = new Map<string, Set<string>>()

  const scanNotebook = (notebook: NotebookDocument) => {
    if (initialScanTarget(config.scanMode) === 'none') return
    for (const cell of notebook.getCells()) scanCell(notebook, cell)
  }

  const clearCell = (notebook: NotebookDocument, cell: NotebookCell) => {
    annotationStore.setForUri(cell.document.uri.toString(), [])
    cellsByNotebookUri
      .get(notebook.uri.toString())
      ?.delete(cell.document.uri.toString())
  }
}
```

`scanCell` must record the cell URI before calling `scanTextDocument(cell.document, 'notebook')`. Register all three workspace notebook event listeners and each disposable with `useDisposable`. On activation, scan every entry in `workspace.notebookDocuments`; on change, scan `addedCells` and clear `removedCells`; on close, clear each URI recorded under that notebook and delete its map entry.

- [ ] **Step 4: Run focused tests and commit**

Run: `pnpm vitest tests/annotation-notebook.test.ts`

Expected: PASS.

Commit: `feat: scan opened notebook cells`

### Task 2: Compose the coordinator with the extension scanner

**Files:**

- Modify: `src/index.ts`
- Modify: `tests/e2e/extension-host.cjs`
- Create: `playground/notebooks/annopulse.ipynb`

**Interfaces:**

- Consumes: `const annotationHighlight = useAnnoPulseHighlight()` and `annotationHighlight.scanTextDocument`.
- Produces: Activated extension wiring that calls `useAnnoPulseNotebook(annotationHighlight.scanTextDocument)` after the highlighter is registered.

- [ ] **Step 1: Add a failing extension-host assertion**

Add a minimal `playground/notebooks/annopulse.ipynb` with one code cell whose source includes `# TODO: inspect notebook cell`. Extend the extension-host smoke test after activation:

```js
await configure('scanMode', 'openEditors')
const notebook = await vscode.workspace.openNotebookDocument(
  vscode.Uri.file(resolve(workspacePath, 'notebooks/annopulse.ipynb')),
)
const cell = notebook.cellAt(0)
const notebookDiagnostics = await waitFor(
  () =>
    vscode.languages
      .getDiagnostics(cell.document.uri)
      .filter(diagnostic => diagnostic.source === 'AnnoPulse'),
  'Expected AnnoPulse diagnostics for the notebook cell',
)
assert.ok(
  notebookDiagnostics.some(diagnostic => diagnostic.message.includes('TODO')),
)
```

- [ ] **Step 2: Run E2E to verify RED**

Run: `pnpm test:e2e`

Expected: FAIL at the notebook-cell diagnostic assertion because extension activation does not register the coordinator.

- [ ] **Step 3: Wire the scanner into activation**

Change extension activation to preserve and compose the highlighter result:

```ts
const annotationHighlight = useAnnoPulseHighlight()
useAnnoPulseNotebook(annotationHighlight.scanTextDocument)
```

Import `useAnnoPulseNotebook` in `src/index.ts`. Keep the existing scan, diagnostics, Explorer, hover, and CodeLens registrations unchanged.

- [ ] **Step 4: Run E2E and regression suites**

Run: `pnpm test:e2e && pnpm test:unit && pnpm format:check && pnpm typecheck`

Expected: notebook-cell assertion and all existing checks PASS.

- [ ] **Step 5: Commit the integration**

Commit: `feat: integrate notebook cell scanning`

### Task 3: Record the Phase 2 milestone and verify the branch

**Files:**

- Modify: `README.md`
- Modify: `docs/plan.md`

- [ ] **Step 1: Update documentation**

Add a concise README statement that opened notebook cells are scanned through the normal Explorer, Problems, and CodeLens paths. In the Phase 2 milestone, mark Notebook cell support complete while leaving dedicated Web/Virtual Workspace automation as remaining work.

- [ ] **Step 2: Run release verification**

Run: `pnpm release:check && pnpm build && pnpm test:e2e && git diff --check`

Expected: all commands pass; lint warnings are recorded only if they are pre-existing and non-failing.

- [ ] **Step 3: Commit documentation**

Commit: `docs: document notebook cell support`
