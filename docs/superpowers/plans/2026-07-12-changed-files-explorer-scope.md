# Changed Files Explorer Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Explorer show only annotations in currently changed Git files without changing default scope behavior or host portability.

**Architecture:** A pure filter receives changed URI strings. The guarded built-in Git adapter gathers URI values from repository state arrays and subscribes to state/open/close events. Explorer owns the asynchronous URI snapshot and subscribes only while `changedFiles` is selected.

**Tech Stack:** TypeScript, VS Code Git API v1, VS Code Extension API, reactive-vscode, vscode-ext-gen, Vitest.

## Global Constraints

- Use only the built-in Git extension API; no shell Git, Node `fs`, processes, dependencies, or external writes.
- Default Explorer scope remains `workspace`; it must not query Git.
- `changedFiles` combines staged, unstaged, merge, and untracked changes using each change's current `uri`, deduplicated as strings.
- Untrusted workspaces, absent/disabled Git, API failures, and virtual repositories return an empty changed URI set and never throw.
- A changed scope result is ANDed with every existing Explorer filter.
- Regenerate `src/meta.ts` via `pnpm generate:meta`; do not hand-edit generated metadata.

---

### Task 1: Add changed-files scope to the pure filter and schema

**Files:**

- Modify: `src/core/explorer/filter.ts`
- Modify: `src/composables/use-beacon-explorer.ts`
- Modify: `tests/beacon-explorer-filter.test.ts`
- Modify: `package.json`
- Regenerate: `src/meta.ts`
- Modify: `tests/package-metadata.test.ts`

**Interfaces:** `BeaconExplorerScope` adds `'changedFiles'`; `BeaconExplorerFilter` adds `changedUris: ReadonlySet<string>`.

- [ ] **Step 1: Write failing tests**

Extend the shared filter fixture with `changedUris: new Set()`. Add a test with annotations in two URIs showing that changed scope returns only the URI in `changedUris`, and another that combines changed scope with `categories: ['bug']` to prove AND behavior. Add a package test asserting the scope schema enum contains `changedFiles` and the generated config key accepts the new literal.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest tests/beacon-explorer-filter.test.ts tests/package-metadata.test.ts`

Expected: FAIL because the scope literal and changed URI input do not exist.

- [ ] **Step 3: Implement pure scope and generated schema**

Add `'changedFiles'` to the scope union and reject non-member URIs before category filtering:

```ts
if (
  filter.scope === 'changedFiles' &&
  !filter.changedUris.has(annotation.uri)
) {
  return false
}
```

Add `"changedFiles"` to the `code-beacon.explorer.scope` package enum and description, run `pnpm generate:meta`, and update metadata expectations.

To retain a compiling Explorer until Task 3 supplies its asynchronous URI snapshot, pass `changedUris: new Set()` to `filterBeaconAnnotations` from `useBeaconExplorer`. Task 3 replaces this inert set with Explorer-owned state; this interim value safely yields no changed-file results without affecting any existing scope.

- [ ] **Step 4: Verify GREEN and commit**

Run: `pnpm vitest tests/beacon-explorer-filter.test.ts tests/package-metadata.test.ts && pnpm typecheck && pnpm format:check`

Commit: `feat: add changed files Explorer scope`

### Task 2: Gather and observe built-in Git changed URIs

**Files:**

- Modify: `src/composables/use-beacon-git.ts`
- Modify: `tests/beacon-git.test.ts`

**Interfaces:** `useBeaconGit()` adds `getChangedUris(): Promise<ReadonlySet<string>>` and `subscribeToChangedUris(listener: () => void): Promise<Disposable>`.

- [ ] **Step 1: Write failing adapter tests**

Mock API `repositories`, repository `state` arrays/events, and API open/close events. Assert all four buckets contribute only `change.uri.toString()`, duplicate and renamed changes use the current URI once, virtual repositories are ignored, untrusted/missing/rejected APIs return an empty set, state events invoke the listener, and disposing removes listeners.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest tests/beacon-git.test.ts`

Expected: FAIL because changed URI methods and repository-state shapes do not exist.

- [ ] **Step 3: Implement guarded state adapter**

Extend local structural types only as needed for `API.repositories`, `onDidOpenRepository`, `onDidCloseRepository`, `Repository.state`, and `Disposable`. Reuse trust/activation/API/virtual guards. Collect:

```ts
const changes = [
  ...state.indexChanges,
  ...state.workingTreeChanges,
  ...state.mergeChanges,
  ...state.untrackedChanges,
]
```

Store `change.uri.toString()` in a set. Subscription wires state events for current repositories and rebinds when repositories open/close; its returned disposable removes all registrations. Catch every activation/API/state error and invoke no listener for unavailable Git.

- [ ] **Step 4: Verify GREEN and commit**

Run: `pnpm vitest tests/beacon-git.test.ts tests/git-blame.test.ts && pnpm typecheck && pnpm format:check`

Commit: `feat: observe changed Git file URIs`

### Task 3: Integrate Explorer snapshots, docs, and release checks

**Files:**

- Modify: `src/composables/use-beacon-explorer.ts`
- Modify: `tests/beacon-explorer.test.ts`
- Modify: `README.md`
- Modify: `docs/plan.md`

- [ ] **Step 1: Write failing Explorer tests**

Extend config fixtures with `scope: 'changedFiles'` support and mock the new Git methods. Assert changed scope initially refreshes from the returned URI set, a subscription event reloads it, switching to workspace disposes the subscription and clears the set, and workspace/ownerless scopes make no Git calls. Assert untrusted/empty responses give an empty provider rather than a thrown error.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest tests/beacon-explorer.test.ts`

Expected: FAIL because Explorer does not own changed URI state or subscribe to Git changes.

- [ ] **Step 3: Implement generation-safe Explorer integration**

Maintain `changedUris`, a request counter, and an optional Git subscription. Pass the set into `filterBeaconAnnotations`. On refresh/config change: immediately refresh provider; if scope is not changedFiles, clear set/dispose subscription; otherwise obtain/reuse subscription and asynchronously replace the set only when its request is current and scope remains changedFiles. Subscription callbacks schedule the same refresh. Dispose the subscription through `useDisposable` and on scope exit.

- [ ] **Step 4: Document and verify**

Add README scope documentation explaining staged/unstaged/merge/untracked semantics and trusted-local Git limitation. Mark only `changed files scope` complete in Phase 3, leaving Source Control integration and richer metadata pending.

Run: `pnpm release:check && pnpm build && pnpm generate:meta && git diff --exit-code -- src/meta.ts README.md && git diff --check`

Expected: full unit, desktop, Web, build, generation, and diff checks pass.

- [ ] **Step 5: Commit**

Commit: `feat: filter Explorer by changed Git files`
