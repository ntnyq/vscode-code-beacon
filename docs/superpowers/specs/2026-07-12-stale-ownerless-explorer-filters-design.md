# Stale and Ownerless Explorer Filters Design

## Goal

Let users narrow Code Beacon Explorer results to annotations that are either stale according to Git blame age or ownerless according to the annotation's explicit owner syntax. The default Explorer remains unchanged and shows all annotations.

## Scope

- Add two opt-in Explorer settings: `onlyStale` and `onlyOwnerless`, both defaulting to `false`.
- Add `code-beacon.git.staleDays`, a positive integer with a default of `90`.
- Compute ownerlessness from `annotation.owner` only. Git authors are display metadata, not an implicit assignment.
- Resolve Git metadata only while `onlyStale` is enabled, then refresh the Explorer as results arrive.
- Use the built-in `vscode.git` API, retain all trusted/local/repository/path safeguards, and work without Node or shell Git.

The following remain out of scope: changed-files scope, Source Control commands, issue generation, TreeView Git descriptions/tooltips, and any persistence of Git metadata.

## Alternatives Considered

### 1. Add Git age directly to every scanned annotation

This would make filtering synchronous, but scanning would start Git work even when the user never uses Git features. It would also mix an asynchronous, volatile concern into the scanner's portable annotation model.

### 2. Query one blame result per visible TreeView item

This delays work, but creates repeated whole-file blame calls and makes result order depend on tree expansion. It is especially poor for a file containing many annotations.

### 3. Recommended: opt-in metadata index with one blame call per document

The Explorer retains portable annotations. When stale filtering is enabled, an in-memory index opens relevant documents, asks the guarded Git adapter for all annotations in that document, and refreshes after each completed document. The adapter performs one `repository.blame()` call per document/version, resolves unique commits, and caches line metadata by URI/version/line. This keeps normal Explorer behavior zero-cost and makes stale filtering correct for workspace-scanned files.

## Settings and Semantics

```jsonc
{
  "code-beacon.explorer.onlyStale": false,
  "code-beacon.explorer.onlyOwnerless": false,
  "code-beacon.git.staleDays": 90,
}
```

The settings compose with existing scope, category, severity, owner, query, resolved, and ignored filters using logical AND.

- An annotation is ownerless when `owner` is absent or empty after trimming.
- An annotation is stale when its resolved Git commit date is strictly older than `now - staleDays * 24 hours`.
- Exact cutoff timestamps are not stale.
- Invalid, missing, or unavailable Git metadata is _unknown_, not stale. Thus an enabled stale filter initially displays no unknown entries and progressively shows only confirmed stale entries.
- A user can combine `onlyStale` and `onlyOwnerless` to require both conditions.

## Components and Data Flow

```text
annotationStore snapshot
        |
        +--> synchronous Explorer filter (ownerless + cached stale state)
        |
        `--> when onlyStale: Git metadata index
              -> documents grouped by URI
              -> guarded getMetadataForAnnotations(document, annotations)
              -> one blame per document, unique commits resolved
              -> id -> metadata map, then provider.refresh()
```

### Core filter

`src/core/explorer/filter.ts` stays VS Code-free. Its filter input gains `onlyOwnerless`, `onlyStale`, a metadata lookup keyed by annotation id, `staleDays`, and an injected `now` time. It exports small deterministic predicates for ownerlessness and staleness. Tests use fixed timestamps and prove all filters compose.

### Git adapter

`useBeaconGit()` adds `getMetadataForAnnotations(document, annotations)`. It reuses the trust, extension, repository, virtual-workspace, URI and repository-relative path gates of the existing one-line lookup. For a valid document it calls blame once, parses every requested line, returns metadata by annotation id, and calls `getCommit()` once per distinct hash. Existing `getMetadata()` delegates to the batch API for one annotation, so Hover behavior and cache semantics are unchanged.

### Explorer metadata index

A small Explorer-owned index stores only metadata for current annotation ids. On store/config/active-editor changes, it removes disappeared ids, immediately refreshes the provider, and starts asynchronous hydration only when `onlyStale` is true. A generation token prevents an older hydration result from overwriting a newer snapshot. Failed, untrusted, virtual, Web, unavailable-Git, unopened-document, or invalid-blame lookups store no metadata and merely leave results unknown; Explorer remains usable.

## Testing

- Core filter tests cover ownerless whitespace, stale before/exactly-at/after cutoff, invalid dates, unknown metadata, and AND composition with current filters.
- Git adapter tests prove a multi-annotation document invokes blame once, resolves duplicate hashes once, maps per-id results, and preserves all existing failure guards.
- Explorer composable tests prove stale hydration refreshes the provider, ownerless needs no Git call, an older async generation cannot affect a newer snapshot, and unavailable metadata does not surface as stale.
- Package metadata tests cover all three settings and generated `src/meta.ts` is regenerated rather than edited by hand.
- Documentation explains the opt-in settings and the trusted local Git limitation.

## Safety and Compatibility

No runtime dependency, shell process, Node `fs`, or `child_process` API is added. Git calls remain disabled in untrusted workspaces, virtual repositories, Web hosts without built-in Git, and documents outside a repository. The feature does not modify documents, source control state, or persisted annotation state.
