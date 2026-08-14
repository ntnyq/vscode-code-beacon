# Git Blame Metadata Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe, cached built-in-Git blame metadata to AnnoPulse hovers in trusted local repositories.

**Architecture:** A VS Code-free core parses one repository blame line and caches resolved commit metadata by document URI/version/line. A composable uses the optional built-in `vscode.git` API to obtain it only in trusted non-virtual repositories. The hover remains useful when metadata is unavailable and appends Git details only after a successful lookup.

**Tech Stack:** TypeScript, VS Code Extension API, built-in `vscode.git` API v1, reactive-vscode, Vitest.

## Global Constraints

- Use the built-in Git extension API only; do not add Node `child_process`, `fs`, shell-Git, or runtime dependencies.
- Never query Git in an untrusted workspace, virtual repository, Web host without Git, or document outside a Git repository.
- The Git provider must fail closed to `undefined`; normal AnnoPulse hover content must still render.
- Cache entries are keyed by URI, document version, and zero-based line.
- Every behavior begins with a focused failing test and ends with focused plus full-suite verification.

---

### Task 1: Build portable blame metadata parsing and caching

**Files:**

- Create: `src/core/git/blame.ts`
- Create: `tests/git-blame.test.ts`

**Interfaces:**

- Produces `AnnoPulseGitMetadata`, `parseBlameCommitHash(output, line)`, and `AnnoPulseGitMetadataCache`.
- `AnnoPulseGitMetadata` has `authorName`, optional `authorEmail`, `commitDate`, `hash`, and `summary`.
- `AnnoPulseGitMetadataCache.get(uri, version, line)` returns metadata or `undefined`; `set(uri, version, line, metadata)` stores one result.

- [ ] **Step 1: Write failing core tests**

Add table-driven parsing tests for ordinary blame rows, boundary hashes beginning with `^`, blank/malformed output, and an out-of-range line. Add cache tests that return the same metadata for identical URI/version/line and miss after either the document version or line changes.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest tests/git-blame.test.ts`

Expected: FAIL because the Git metadata module does not exist.

- [ ] **Step 3: Implement the pure core module**

Parse the first whitespace-delimited token from the requested zero-based blame line, remove a leading `^`, and accept only non-empty hexadecimal hashes. Store cache entries under `${uri}:${version}:${line}`. Do not import VS Code.

- [ ] **Step 4: Verify GREEN and commit**

Run: `pnpm vitest tests/git-blame.test.ts`

Expected: PASS.

Commit: `feat: add cached git blame metadata core`

### Task 2: Resolve metadata through the built-in Git extension API

**Files:**

- Create: `src/composables/use-annotation-git.ts`
- Create: `tests/annotation-git.test.ts`

**Interfaces:**

- Produces `useAnnoPulseGit()` with `getMetadata(document, annotation): Promise<AnnoPulseGitMetadata | undefined>`.
- Uses narrow local structural interfaces for `GitExtension`, `API`, `Repository`, and `Commit`; do not add a `vscode.git` type dependency.

- [ ] **Step 1: Write failing composable tests**

Mock `extensions.getExtension`, `workspace.isTrusted`, and a `TextDocument`. Assert that a trusted local repository activates `vscode.git`, calls `repository.blame(workspace.asRelativePath(uri, false))`, resolves the requested commit via `getCommit`, and returns its metadata. Add independent tests asserting no Git call for untrusted workspaces, virtual repositories, absent Git extension/API, malformed blame, and rejected blame/commit promises. Assert repeated same-version lookups use the cache.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest tests/annotation-git.test.ts`

Expected: FAIL because `useAnnoPulseGit` does not exist.

- [ ] **Step 3: Implement the guarded API adapter**

Use `extensions.getExtension<unknown>('vscode.git')`, `await extension.activate()`, and a checked `getAPI(1)` shape. Require `workspace.isTrusted`; select `api.getRepository(document.uri)`; reject `repository.isUsingVirtualFileSystem`; then cache a parsed blame hash plus `await repository.getCommit(hash)`. Convert commit fields into `AnnoPulseGitMetadata`; catch every activation/API/blame/commit failure and return `undefined`.

- [ ] **Step 4: Verify GREEN and commit**

Run: `pnpm vitest tests/annotation-git.test.ts tests/git-blame.test.ts`

Expected: PASS.

Commit: `feat: resolve annotation git blame metadata`

### Task 3: Enrich async hover content and release verification

**Files:**

- Modify: `src/core/hover/format.ts`
- Modify: `src/composables/use-annotation-hover.ts`
- Modify: `src/index.ts`
- Modify: `tests/hover-format.test.ts`
- Create: `tests/annotation-hover.test.ts`
- Modify: `README.md`
- Modify: `docs/plan.md`

**Interfaces:**

- `formatAnnoPulseHoverMarkdown(annotation, metadata?)` preserves existing output and appends author, date, short hash, and summary only when metadata is supplied.
- `useAnnoPulseHover(getMetadata?)` awaits optional metadata before constructing `Hover`.

- [ ] **Step 1: Write failing formatting and hover tests**

Extend the formatter test with deterministic metadata and assert the existing lines remain plus a Git section containing author, ISO date, short hash, and summary. Mock a metadata lookup in `tests/annotation-hover.test.ts`; assert it receives the hovered document/annotation and a rejected/undefined lookup still produces the base hover.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest tests/hover-format.test.ts tests/annotation-hover.test.ts`

Expected: FAIL because formatter and hover do not accept metadata.

- [ ] **Step 3: Implement optional async enrichment**

Pass `useAnnoPulseGit().getMetadata` from `src/index.ts` into `useAnnoPulseHover`. Change `provideHover` to await the lookup only after it finds an annotation. Keep the formatter deterministic and avoid rendering a Git heading for `undefined` metadata.

- [ ] **Step 4: Document and verify release checks**

Document trusted-local Git hover enrichment and its Web/Virtual/Untrusted fallback behavior. In Phase 3, mark Git blame metadata foundation complete while leaving stale filters, issue generation, changed-file scope, source-control integration, and richer TreeView metadata pending.

Run: `pnpm release:check && pnpm build && git diff --check`

Expected: all checks pass.

- [ ] **Step 5: Commit integration and docs**

Commit: `feat: enrich annotation hover with git blame metadata`
