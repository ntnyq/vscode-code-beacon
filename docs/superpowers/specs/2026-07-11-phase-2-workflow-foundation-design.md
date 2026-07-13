# Phase 2 Workflow Foundation Design

## Goal

Make Code Beacon's workspace workflow useful across an editing session and extension restarts: keep manual workflow state, show only relevant annotations in Explorer, and update workspace scan results when files change.

## Scope

This increment implements three independent capabilities from Phase 2 of `docs/plan.md`:

1. Persist resolved and ignored annotation IDs in VS Code `workspaceState`.
2. Filter and deterministically sort Explorer annotations through configuration.
3. Keep workspace-scan annotations synchronized from `FileSystemWatcher` events.

Git metadata, changed-files scope, notebooks, AI actions, and SARIF remain out of scope.

## Decisions

### Workflow state

`workspaceState` is the persistence boundary. It follows the opened workspace, works in desktop and web extension hosts, and avoids writing files directly. The annotation store remains the single runtime owner of resolved/ignored state; it gains snapshot and restore operations. A thin Memento adapter serializes only two string arrays under one stable key.

State is restored before the initial scan, and every state mutation is saved asynchronously. `clearCache` clears both runtime annotations and the persisted workflow state.

### Explorer filtering

Filtering is a pure `filterBeaconAnnotations()` function. It receives annotations and a plain filter object, so category, severity, owner, text query, resolved/ignored visibility, active-file scope, and open-editors scope can be tested without VS Code. The TreeView composes this function with the active editor and visible editor URI set, and refreshes on configuration/editor changes. Leaf annotations are sorted by URI, line, and column.

The settings use an `explorer` namespace and have conservative defaults: all scopes and categories are visible, while resolved and ignored items are hidden. This preserves current Explorer behavior for active beacons.

### Incremental workspace scan

`useWorkspaceScan()` owns a `FileSystemWatcher` that is registered only after a workspace scan has supplied workspace-sourced annotations. Creates and changes scan one URI and replace only its workspace annotation slice; deletes remove that URI's workspace annotations. Before scanning a changed URI, the scanner confirms the URI matches the effective include/exclude configuration through a narrow `workspace.findFiles` query. This reuses VS Code's glob implementation rather than introducing a Node-specific glob dependency.

Concurrent changes to the same URI are coalesced through a per-URI generation counter: a late document read cannot overwrite a newer result. File-system failures log a warning and retain the last known annotation state.

## Compatibility and error handling

- Use only VS Code workspace APIs and `Memento`; no Node file APIs or shell commands.
- Do not persist annotation text, paths, or source code—only stable annotation IDs.
- Reject malformed persisted values by treating them as empty state.
- Ignore watcher events outside the configured include/exclude set.
- Continue the rest of a workspace scan if one file cannot be read.

## Test strategy

- Store tests cover snapshot/restore and state reset.
- Storage tests cover valid and malformed Memento payloads.
- Pure Explorer tests cover each filter and location ordering.
- Workspace watcher tests mock VS Code events and assert create/change/delete behavior, configuration filtering, and stale-update protection.
- Existing E2E continues to validate activation and the complete extension-host path.
