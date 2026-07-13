# Changed Files Explorer Scope Design

## Goal

Add an opt-in `changedFiles` Explorer scope that shows only annotations in files currently changed according to VS Code's built-in Git extension, while preserving the existing default workspace scope and working safely in every supported host.

## Scope

- Add `changedFiles` to `code-beacon.explorer.scope`.
- Collect the current URI of every staged, unstaged, merge, and untracked Git change across non-virtual repositories.
- Refresh changed-file results when a repository state changes.
- Compose changed-file scope with existing category, severity, owner, text, resolved, ignored, stale, and ownerless filters.
- Fail closed to an empty changed-file result when Git is unavailable, a workspace is untrusted, or every repository is virtual.

Out of scope: source-control commands, changed-file decorations, history/diff rendering, shell Git, Node processes, and changed files outside the built-in Git API.

## Alternatives Considered

### 1. Shell `git status`

This has broad compatibility on desktop but fails in Web/virtual hosts and violates the extension's portability constraints.

### 2. Reuse the workspace scanner's changed event stream

File watchers reveal that a file changed but cannot distinguish Git-tracked changes, staged state, or pre-existing workspace edits. They also cannot surface untracked files reliably.

### 3. Recommended: built-in Git repository state

VS Code Git API v1 exposes `workingTreeChanges`, `indexChanges`, `mergeChanges`, and `untrackedChanges`, and each repository's state change event. The implementation collects the current `Change.uri` from all local repositories, deduplicates URI strings, and refreshes the Explorer whenever Git state changes. It needs no shell or file-system APIs.

## Semantics

- `changedFiles` includes staged, unstaged, merge-conflict, and untracked changes.
- For a rename, use `Change.uri`, not the old/original URI, because annotations belong to the current document path. Deleted files have no current annotations and naturally do not appear.
- The scope is logical AND with all other Explorer filters.
- Default scope remains `workspace`; no Git extension is queried unless the user selects `changedFiles`.
- In untrusted workspaces, absent/disabled Git extension, Git API failures, virtual repositories, or Web hosts with no usable Git API, the changed URI set is empty. The view remains functional and shows no false “changed” results.

## Architecture

```text
Repository.state arrays + onDidChange
             |
             v
useBeaconGit.getChangedUris / subscribeToChangedUris
             |
             v
useBeaconExplorer changed-uri snapshot + provider.refresh
             |
             v
filterBeaconAnnotations(scope: changedFiles, changedUris)
```

### Pure Explorer filter

`BeaconExplorerScope` gains `changedFiles`; `BeaconExplorerFilter` gains `changedUris`. When scope is `changedFiles`, an annotation matches only when its URI string belongs to that set. This code remains VS Code-free and receives data/time explicitly for deterministic tests.

### Guarded Git adapter

`useBeaconGit()` adds:

```ts
getChangedUris(): Promise<ReadonlySet<string>>
subscribeToChangedUris(listener: () => void): Promise<Disposable>
```

It reuses the existing workspace-trust, activation, API shape, and virtual-repository guards. For each valid repository, it merges all four state arrays, uses only `change.uri.toString()`, and catches errors to return an empty or partial set. The subscription listens to each repository's `state.onDidChange`, plus API repository open/close events, then invokes the supplied listener; cleanup disposes every listener.

### Explorer integration

`useBeaconExplorer()` owns a `Set<string>` for the current changed URI snapshot and a monotonic refresh request. It calls Git only while scope is `changedFiles`; a result from an older request cannot replace a newer scope/snapshot. Git repository events schedule a fresh snapshot and provider refresh. Switching away clears the set and disposes the subscription. Explorer provider construction stays synchronous.

## Testing

- Filter tests cover the `changedFiles` scope alone and composed with category/owner/stale filters.
- Git adapter tests cover each Git state bucket, URI de-duplication, rename current URI selection, untrusted/virtual/absent/failing Git cases, repository-state callback, and disposal.
- Explorer tests cover initial changed filtering, state-event refresh, scope switch cancellation, no Git calls outside changed scope, and fail-closed unavailable Git behavior.
- Package metadata tests cover the new enum setting and regenerated `src/meta.ts`.
- README and roadmap document the scope and limitation; release verification includes generator idempotence and desktop/Web tests.

## Safety and Compatibility

No external service, shell Git, Node runtime API, document mutation, or persistent Git state is introduced. The built-in Git API is never queried in an untrusted workspace, and virtual/no-Git environments show an empty changed-files subset rather than misrepresenting the workspace.
