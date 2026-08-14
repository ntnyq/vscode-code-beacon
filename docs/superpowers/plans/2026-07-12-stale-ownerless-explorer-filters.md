# Stale and Ownerless Explorer Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add opt-in, Git-aware stale and explicit-ownerless filters to AnnoPulse Explorer without changing its default results.

**Architecture:** Keep classification deterministic in the VS Code-free Explorer filter. Extend the guarded Git adapter with a per-document batch lookup, then let an Explorer metadata index hydrate only when stale filtering is enabled and refresh as each document completes. Unknown Git metadata is never classified as stale.

**Tech Stack:** TypeScript, VS Code Extension API, built-in `vscode.git` API v1, reactive-vscode, vscode-ext-gen, Vitest.

## Global Constraints

- Use only the built-in Git extension API; do not add shell Git, Node `fs`, `child_process`, or runtime dependencies.
- Git calls must remain fail-closed in untrusted workspaces, virtual repositories, Web hosts without built-in Git, and documents outside a repository.
- Existing default Explorer behavior remains unchanged: both new filters default to `false`.
- `onlyOwnerless` uses only `annotation.owner`; Git authors do not assign annotations.
- Stale means a valid commit date strictly before `now - staleDays * 24 hours`; unknown, invalid, or unavailable Git metadata is not stale.
- `annopulse.git.staleDays` has default `90` and schema minimum `1`.
- Regenerate `src/meta.ts` with `pnpm generate:meta` after modifying `package.json`; never hand-edit generated metadata.
- Begin each behavior with a focused failing test and finish every task with focused plus full relevant verification.

---

### Task 1: Add deterministic filter semantics and settings

**Files:**

- Modify: `src/core/explorer/filter.ts`
- Modify: `src/composables/use-annotation-explorer.ts`
- Modify: `tests/annotation-explorer-filter.test.ts`
- Modify: `package.json`
- Regenerate: `src/meta.ts`
- Modify: `tests/package-metadata.test.ts`

**Interfaces:**

- `AnnoPulseExplorerFilter` gains `onlyOwnerless: boolean`, `onlyStale: boolean`, `staleDays: number`, `now: Date`, and `metadataByAnnotationId: ReadonlyMap<string, AnnoPulseGitMetadata>`.
- `isAnnoPulseOwnerless(annotation)` returns true only for a missing or whitespace-only explicit owner.
- `isAnnoPulseStale(metadata, staleDays, now)` returns true only for a valid commit date strictly before the computed cutoff.

- [ ] **Step 1: Write failing filter and package-metadata tests**

In `tests/annotation-explorer-filter.test.ts`, make the shared filter fixture include a fixed `now`, `staleDays: 90`, empty `metadataByAnnotationId`, and both booleans false. Add tests that prove: missing and whitespace owners match only `onlyOwnerless`; a commit one millisecond before the exact 90-day cutoff matches; a commit exactly at or after the cutoff does not; invalid/missing metadata does not match stale; and both toggles compose with an existing category filter using AND.

In `tests/package-metadata.test.ts`, add these keys to the expected configuration set:

```ts
'annopulse.explorer.onlyStale',
'annopulse.explorer.onlyOwnerless',
'annopulse.git.staleDays',
```

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest tests/annotation-explorer-filter.test.ts tests/package-metadata.test.ts`

Expected: FAIL because the new filter fields, predicates, and configuration metadata do not exist.

- [ ] **Step 3: Implement pure classification and schema**

Import `AnnoPulseGitMetadata` as a type and add these helpers to `src/core/explorer/filter.ts`:

```ts
export function isAnnoPulseOwnerless(annotation: AnnoPulseAnnotation): boolean {
  return (
    annotation.owner?.trim() === undefined || annotation.owner.trim() === ''
  )
}

export function isAnnoPulseStale(
  metadata: AnnoPulseGitMetadata | undefined,
  staleDays: number,
  now: Date,
): boolean {
  const commitTime = metadata ? Date.parse(metadata.commitDate) : Number.NaN
  const cutoff = now.getTime() - staleDays * 24 * 60 * 60 * 1000
  return Number.isFinite(commitTime) && commitTime < cutoff
}
```

Before the existing category filter, reject an annotation when `onlyOwnerless` is true and `isAnnoPulseOwnerless(annotation)` is false; reject it when `onlyStale` is true and `isAnnoPulseStale(metadataByAnnotationId.get(annotation.id), staleDays, now)` is false.

To preserve a compiling Explorer before Task 3 adds asynchronous hydration, pass the new fields from `useAnnoPulseExplorer` with `config.explorer.onlyOwnerless`, `config.explorer.onlyStale`, `config.git.staleDays`, `new Date()`, and an empty `new Map()` for `metadataByAnnotationId`. This makes ownerless filtering functional immediately and treats all stale values as unknown until Task 3 replaces the empty map with its metadata index.

Add settings to `package.json`:

```json
"annopulse.explorer.onlyStale": { "type": "boolean", "default": false },
"annopulse.explorer.onlyOwnerless": { "type": "boolean", "default": false },
"annopulse.git.staleDays": { "type": "number", "default": 90, "minimum": 1 }
```

Use descriptions matching the design semantics, run `pnpm generate:meta`, and do not edit `src/meta.ts` manually.

- [ ] **Step 4: Verify GREEN and commit**

Run: `pnpm vitest tests/annotation-explorer-filter.test.ts tests/package-metadata.test.ts && pnpm typecheck && pnpm format:check`

Expected: focused tests, generated config types, formatting, and type check pass.

Commit: `feat: add stale and ownerless Explorer filters`

### Task 2: Batch Git metadata lookup by document

**Files:**

- Modify: `src/composables/use-annotation-git.ts`
- Modify: `tests/annotation-git.test.ts`

**Interfaces:**

- `useAnnoPulseGit()` additionally returns `getMetadataForAnnotations(document, annotations): Promise<ReadonlyMap<string, AnnoPulseGitMetadata>>`.
- Existing `getMetadata(document, annotation)` remains public and delegates to the batch lookup for a one-element array.
- Successful results use annotation ids as keys; absent results are omitted.

- [ ] **Step 1: Write failing adapter tests**

In `tests/annotation-git.test.ts`, create two annotations in one document where two lines share one hash and a third line has another. Assert `repository.blame()` is called once with the repository-relative path, `getCommit()` is called once per distinct uncached hash, and the returned map contains each annotation id with its expected metadata. Add a cache test proving a second same-version batch performs neither blame nor commit lookup for cached lines. Preserve all current tests for trust, virtual, path, malformed blame, rejected promises, and nested repository roots.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest tests/annotation-git.test.ts`

Expected: FAIL because the batch method is absent.

- [ ] **Step 3: Implement one-blame batch lookup**

Add the public method and make the old one-line method use it:

```ts
async getMetadata(document, annotation) {
  return (await getMetadataForAnnotations(document, [annotation])).get(annotation.id)
}
```

Apply the existing trust, extension activation, Git API, repository, virtual repository, URI scheme/authority, repository-root-relative path, and relative-path guards before calling `repository.blame(path)` once. For each requested annotation, first read `AnnoPulseGitMetadataCache`; for misses parse the corresponding blame line, group annotation ids by hash, call `getCommit(hash)` once per uncached hash, validate the flat VS Code `authorName`/`authorEmail`/`authorDate` fields, cache resulting metadata by URI/version/line, and return an id-keyed map. Catch all errors and return the successful subset or an empty map; never throw to callers.

- [ ] **Step 4: Verify GREEN and commit**

Run: `pnpm vitest tests/annotation-git.test.ts tests/git-blame.test.ts tests/annotation-hover.test.ts && pnpm typecheck && pnpm format:check`

Expected: all focused Git, cache, and Hover compatibility tests pass.

Commit: `feat: batch Git metadata for Explorer filters`

### Task 3: Hydrate Explorer stale state and document the feature

**Files:**

- Create: `src/core/explorer/git-metadata-index.ts`
- Create: `tests/explorer-git-metadata-index.test.ts`
- Modify: `src/composables/use-annotation-explorer.ts`
- Modify: `tests/annotation-explorer.test.ts`
- Modify: `README.md`
- Modify: `docs/plan.md`

**Interfaces:**

- `AnnoPulseExplorerGitMetadataIndex<TDocument>` exposes `metadataByAnnotationId`, `clear()`, and `hydrate(targets, resolve, onUpdate): Promise<void>`.
- `targets` contain a document and its current annotations; `resolve(document, annotations)` is the Task 2 batch lookup.
- A newer `hydrate()` generation discards all results from older generations.

- [ ] **Step 1: Write failing index and Explorer integration tests**

Create `tests/explorer-git-metadata-index.test.ts` with deferred resolver promises. Assert metadata becomes available after each target resolves, `clear()` empties the map, and completing an older generation after a newer one cannot add stale entries.

In `tests/annotation-explorer.test.ts`, extend the config fixture with `onlyOwnerless: false`, `onlyStale: false`, and `git.staleDays: 90`. Mock `useAnnoPulseGit` and `workspace.openTextDocument`. Assert ownerless filtering does not open a document or call Git; stale filtering opens grouped documents, supplies their annotations to the batch method, and refreshes the provider when returned metadata changes which annotations match. Assert rejected/open failures leave the view operational with no incorrectly stale annotation.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest tests/explorer-git-metadata-index.test.ts tests/annotation-explorer.test.ts`

Expected: FAIL because the index and stale hydration do not exist.

- [ ] **Step 3: Implement generation-safe metadata index**

Create a VS Code-free index whose hydration increments a generation counter, clears previous metadata for the new snapshot, processes targets sequentially, and calls `onUpdate()` after each current-generation result:

```ts
export interface AnnoPulseExplorerMetadataTarget<TDocument> {
  readonly document: TDocument
  readonly annotations: readonly AnnoPulseAnnotation[]
}

export type AnnoPulseExplorerMetadataResolver<TDocument> = (
  document: TDocument,
  annotations: readonly AnnoPulseAnnotation[],
) => Promise<ReadonlyMap<string, AnnoPulseGitMetadata>>
```

In `useAnnoPulseExplorer`, create the index and `useAnnoPulseGit()`. Pass its map, current `new Date()`, `config.explorer.onlyStale`, `config.explorer.onlyOwnerless`, and `config.git.staleDays` to `filterAnnoPulseAnnotations`. On store/config/active/visible-editor changes, refresh immediately. Only when `onlyStale` is true, group the current snapshot by URI, open each document with `workspace.openTextDocument(Uri.parse(uri))`, skip open failures, and hydrate with `getMetadataForAnnotations`; each index update calls `provider.refresh()`. When stale filtering is disabled, clear the index and make no Git/document calls.

- [ ] **Step 4: Document and verify release checks**

Update `README.md` with the two Explorer settings, `git.staleDays`, explicit-owner semantics, trusted-local Git requirement, and unknown-metadata fallback. In `docs/plan.md`, mark only `stale/ownerless filters` complete in Phase 3; leave Create Issue, changed-files scope, Source Control integration, and richer metadata pending.

Run: `pnpm release:check && pnpm build && git diff --check`

Expected: all checks pass.

- [ ] **Step 5: Commit integration and documentation**

Commit: `feat: hydrate Explorer stale filters from Git metadata`
