# Phase 2 Workflow Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist annotation workflow state, filter Explorer results, and synchronize workspace scan results after file changes.

**Architecture:** The annotation store remains the sole runtime state owner. A small VS Code Memento adapter persists state snapshots, a pure Explorer filter provides deterministic presentation, and `useWorkspaceScan()` owns incremental file-system synchronization using only VS Code workspace APIs.

**Tech Stack:** TypeScript, VS Code Extension API, reactive-vscode, Vitest, vscode-ext-gen.

## Global Constraints

- Use VS Code workspace APIs and Memento only; do not introduce Node file APIs, shell commands, or a glob dependency.
- Support desktop, web, remote, and virtual workspace hosts.
- Persist only annotation IDs, never source text or workspace paths.
- Preserve the current default Explorer behavior: unresolved, non-ignored beacons from every source remain visible.
- Every behavioral change starts with a failing Vitest test and ends with its focused suite passing.

---

### Task 1: Persist resolved and ignored annotation state

**Files:**

- Create: `src/core/store/annotation-state.ts`
- Modify: `src/core/store/annotation-store.ts`
- Modify: `src/composables/use-beacon-commands.ts`
- Modify: `src/index.ts`
- Test: `tests/annotation-store.test.ts`
- Test: `tests/annotation-state.test.ts`

**Interfaces:**

- Produces `BeaconAnnotationState`, `AnnotationStateStorage`, and `createMementoAnnotationStateStorage(memento)`.
- Adds `getState()` and `restoreState(state)` to `AnnotationStore`.
- `useBeaconCommands(workspaceState)` restores state before registering commands and persists updates.

- [ ] **Step 1: Write failing tests**

Add a store test that marks `a` resolved and `b` ignored, expects `getState()` to equal `{ resolvedIds: ['a'], ignoredIds: ['b'] }`, restores that snapshot into a new store, scans both annotations, and expects the state flags to be applied. Add adapter tests using an object with `get` and `update` methods: a valid payload round-trips and an invalid payload becomes empty state.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm vitest tests/annotation-store.test.ts tests/annotation-state.test.ts`

Expected: FAIL because the snapshot/restore and Memento adapter APIs do not exist.

- [ ] **Step 3: Implement the store state and Memento adapter**

Define `BeaconAnnotationState` as readonly `resolvedIds` and `ignoredIds` arrays. Normalize stored arrays by retaining only strings and de-duplicating them. Add `getState()` with sorted IDs and `restoreState()` that replaces both sets, refreshes stored annotations, and notifies listeners. Store the payload under `code-beacon.annotationState` through `Memento.update`.

- [ ] **Step 4: Wire persistence into extension activation**

Accept `workspaceState: Memento` in `useBeaconCommands`, restore the saved snapshot before command registration, and subscribe to store changes with `void storage.save(annotationStore.getState())`. Pass `context.workspaceState` from `defineExtension` in `src/index.ts`.

- [ ] **Step 5: Run focused tests and commit**

Run: `pnpm vitest tests/annotation-store.test.ts tests/annotation-state.test.ts`

Expected: PASS.

Commit: `feat: persist beacon workflow state`

### Task 2: Add deterministic Explorer filters

**Files:**

- Create: `src/core/explorer/filter.ts`
- Modify: `src/core/explorer/tree-data-provider.ts`
- Modify: `src/composables/use-beacon-explorer.ts`
- Modify: `package.json`
- Regenerate: `src/meta.ts`
- Test: `tests/beacon-explorer-filter.test.ts`
- Test: `tests/tree-data-provider.test.ts`

**Interfaces:**

- Produces `BeaconExplorerFilter` and `filterBeaconAnnotations(annotations, filter)`.
- The filter has `scope`, category/severity/owner arrays, `query`, `includeResolved`, `includeIgnored`, `activeUri`, and `openUris`.
- Tree provider receives the filtered list and orders leaves by URI, line, then column.

- [ ] **Step 1: Write failing tests**

Write table-driven tests with annotations across two URIs, categories, severities, owners, and state flags. Assert that each filter dimension removes only non-matching annotations; an empty query and empty selection arrays do not filter; query matches keyword, message, owner, and rule ID case-insensitively. Add a tree test asserting leaves are returned in source-location order.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm vitest tests/beacon-explorer-filter.test.ts tests/tree-data-provider.test.ts`

Expected: FAIL because the filter module and ordered leaves do not exist.

- [ ] **Step 3: Implement pure filtering and ordering**

Implement `filterBeaconAnnotations` without VS Code imports. Treat empty filter arrays as no constraint, hide resolved/ignored items unless their inclusion flag is true, and make `activeFile`/`openEditors` scope depend only on supplied URI values. Sort filtered annotations by `uri.localeCompare`, `line`, then `column` before grouping.

- [ ] **Step 4: Add Explorer settings and composition**

Add settings under `code-beacon.explorer`: `scope` (`workspace`, `activeFile`, `openEditors`), `categories`, `severities`, `owners`, `query`, `includeResolved`, and `includeIgnored`. Run `pnpm generate:meta`. In `useBeaconExplorer`, compose these settings with `window.activeTextEditor` and `window.visibleTextEditors`, and refresh the provider when the active editor, visible editors, or Code Beacon configuration changes.

- [ ] **Step 5: Run focused tests and commit**

Run: `pnpm vitest tests/beacon-explorer-filter.test.ts tests/tree-data-provider.test.ts`

Expected: PASS.

Commit: `feat: filter Code Beacon explorer`

### Task 3: Synchronize workspace scan annotations on file events

**Files:**

- Modify: `src/composables/use-workspace-scan.ts`
- Test: `tests/workspace-scan.test.ts`

**Interfaces:**

- `useWorkspaceScan()` retains the existing `scanWorkspace()` command.
- It additionally owns a watcher and `rescanWorkspaceUri(uri)` that updates only `source: 'workspace'` annotations for that URI.

- [ ] **Step 1: Write failing tests**

Mock `workspace.createFileSystemWatcher`, its create/change/delete events, `workspace.findFiles`, and `workspace.openTextDocument`. After an initial scan, assert a change replaces one URI's workspace annotations, a delete removes that URI's workspace annotations, and an excluded URI is not opened. Trigger two changes to one URI with deferred reads and assert the newer generation wins.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm vitest tests/workspace-scan.test.ts`

Expected: FAIL because watcher events are not registered or handled.

- [ ] **Step 3: Refactor one-URI scanning from the existing command**

Extract a helper that normalizes rules, opens one URI, scans it with source `workspace`, and returns its annotations. Make the full scan use that helper so manual and incremental paths share error handling and scan options.

- [ ] **Step 4: Register watcher and handle events**

Create a watcher for the effective include glob. For create/change events, confirm the URI is returned by a one-file `workspace.findFiles` query with the effective exclude glob before scanning. Use a per-URI generation counter and update the store with `replaceForSource('workspace', ...)` only when the request is current. For delete events, replace the URI's workspace slice with an empty list. Register the watcher and all event subscriptions through `useDisposable`.

- [ ] **Step 5: Run focused tests and commit**

Run: `pnpm vitest tests/workspace-scan.test.ts`

Expected: PASS.

Commit: `feat: synchronize workspace beacon scans`

### Task 4: Verify and document the completed Phase 2 increment

**Files:**

- Modify: `README.md`
- Modify: `docs/plan.md`

- [ ] **Step 1: Update user documentation**

Document persisted resolved/ignored state and the new Explorer settings. In the Phase 2 milestone, mark the delivered capabilities as complete and retain notebooks, dedicated Web tests, and Git/AI work as future work.

- [ ] **Step 2: Run release verification**

Run: `pnpm release:check`

Expected: formatting, lint, type checking, unit tests, build, and extension-host E2E all pass.

- [ ] **Step 3: Commit documentation**

Commit: `docs: document phase 2 workflow foundation`
