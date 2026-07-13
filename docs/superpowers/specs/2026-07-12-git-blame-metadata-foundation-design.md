# Git Blame Metadata Foundation Design

## Goal

Enrich Code Beacon annotation hovers with the last Git commit's author, date,
hash, and summary when the document belongs to a trusted local Git repository,
without weakening Web, virtual-workspace, or untrusted-workspace support.

## Scope

- Use the built-in `vscode.git` extension API only in this increment.
- Resolve a hovered annotation's source line to a commit, then resolve that
  commit's author, email, date, hash, and message.
- Cache metadata by document URI, document version, and annotation line.
- Extend the existing hover formatter with an optional Git section.
- Treat unavailable Git, virtual repositories, untrusted workspaces, invalid
  blame output, and Git API failures as a silent no-metadata result.

## Alternatives

1. Shell out to `git blame --line-porcelain`. This can supply complete data,
   but introduces a desktop-only process dependency and must be guarded in Web,
   virtual, and untrusted hosts. Defer it to a later fallback increment.
2. Parse repository files directly. This is complex, error-prone, and violates
   the extension's VS Code API portability strategy. Rejected.
3. Use the built-in Git extension API (`GitExtension#getAPI(1)`,
   `Repository#blame`, and `Repository#getCommit`). This is the recommended
   primary provider: it gives local Git data without Code Beacon spawning a
   process, and naturally degrades when Git is unavailable.

## Architecture

`src/core/git/blame.ts` owns portable Git metadata types, parsing the commit
hash from a single line of `Repository#blame(path)` output, and a versioned
cache. It has no VS Code imports, so parsing and cache behavior are unit
testable.

`src/composables/use-beacon-git.ts` owns the VS Code integration. It activates
`vscode.git` when present, gets API version 1, selects the repository for the
current document, and rejects untrusted or virtual repositories before asking
for blame. It derives the blame path from `document.uri.path` relative to the
selected `Repository#rootUri.path`, so nested repositories receive a
repository-root-relative path, then resolves the parsed hash through
`Repository#getCommit`. It returns `undefined` on every unsupported or failed
path.

`useBeaconHover()` receives the lookup capability. Its provider remains
asynchronous only while adding optional metadata; the original annotation
content always remains available. `formatBeaconHoverMarkdown(annotation,
metadata?)` adds a compact Git section only when metadata exists.

## Compatibility and Safety

- There is no Node or shell import in the extension runtime.
- The provider refuses `!workspace.isTrusted`, a missing Git extension/API,
  `Repository.isUsingVirtualFileSystem`, and documents outside the selected
  repository.
- Cached data never crosses document versions, so editing or reloading a file
  cannot show stale line attribution.
- A provider failure does not surface a notification or suppress the normal
  Code Beacon hover.

## Testing

Unit tests prove blame-line parsing, malformed-output rejection, cache reuse,
and cache misses after a document-version change. Composable tests mock the
built-in Git extension and assert trusted local success, virtual/untrusted
skip, Git failure fallback, and hover markdown formatting. Existing hover
tests continue to prove the base content remains intact.

## Deferred Follow-ups

- Optional trusted-desktop shell fallback.
- Stale/ownerless Explorer filters and richer TreeView metadata.
- Create Issue body and changed-files source-control integration.

## Reference

The built-in Git extension exposes `GitExtension#getAPI(1)`,
`Repository#blame(path)`, and `Repository#getCommit(ref)` through its API
definition. [VS Code Git API source](https://raw.githubusercontent.com/microsoft/vscode/main/extensions/git/src/api/git.d.ts)
