# Create Issue Body Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe command that turns one selected Beacon annotation into a portable Markdown issue body and copies it to the clipboard.

**Architecture:** A VS Code-free issue formatter produces a deterministic title/body from an annotation and optional Git metadata. The command adapter copies only that body and reports success or missing selection; Explorer and CodeLens pass the selected annotation to the same command.

**Tech Stack:** TypeScript, VS Code Extension API, reactive-vscode, vscode-ext-gen, Vitest.

## Global Constraints

- Do not add runtime dependencies, Node APIs, shell commands, web requests, credentials, or external issue creation.
- A valid explicit `BeaconAnnotation` is required; never infer an issue from all annotations.
- The command writes only the local VS Code clipboard and must not claim success after a failed write.
- Location uses the existing one-based `uri:line:column` convention.
- Owner data comes only from `annotation.owner`; Git data is optional input and is never resolved by this command.
- Dynamic title and inline-code fields must be normalized/escaped so they cannot break generated Markdown structure.
- Regenerate `src/meta.ts` via `pnpm generate:meta`; run the project generation command rather than hand-editing generated metadata.

---

### Task 1: Build the portable issue formatter

**Files:**

- Create: `src/core/issues/format.ts`
- Create: `tests/issue-format.test.ts`

**Interfaces:**

- `BeaconIssueContent` has readonly `title: string` and `body: string`.
- `formatBeaconIssue(annotation, metadata?): BeaconIssueContent` accepts `BeaconAnnotation` and optional `BeaconGitMetadata`.

- [ ] **Step 1: Write failing formatter tests**

Create `tests/issue-format.test.ts` with a complete annotation fixture. Assert exact title `TODO: Replace deprecated parser`, one-based location, category/severity/rule lines, and message section. Add cases for empty and whitespace owners, a message whose first line becomes the title, backticks/newlines in dynamic values, and a Git block that is omitted without metadata and contains author/date/7-character hash/summary with metadata.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest tests/issue-format.test.ts`

Expected: FAIL because the issue formatter module does not exist.

- [ ] **Step 3: Implement the pure formatter**

Create helpers that normalize line endings, take the first nonempty line for a title, and escape inline code by replacing backticks with `\\``. Implement output with these fixed sections:

```ts
return {
  title,
  body: [
    '## Code Beacon',
    '',
    `- **Category:** \`${annotation.category}\``,
    `- **Severity:** \`${annotation.severity}\``,
    `- **Rule:** \`${annotation.ruleId}\``,
    `- **Location:** \`${location}\``,
    ownerLine,
    '',
    '## Annotation',
    '',
    message || 'No annotation message provided.',
    gitSection,
    '',
  ]
    .filter(Boolean)
    .join('\n'),
}
```

Use a seven-character hash and omit the full Git section unless metadata is supplied. Import no VS Code modules.

- [ ] **Step 4: Verify GREEN and commit**

Run: `pnpm vitest tests/issue-format.test.ts && pnpm typecheck && pnpm format:check`

Expected: formatter tests, type check, and formatting pass.

Commit: `feat: format Beacon issue bodies`

### Task 2: Register the clipboard command and expose it in VS Code UI

**Files:**

- Modify: `package.json`
- Regenerate: `src/meta.ts`
- Modify: `src/composables/use-beacon-commands.ts`
- Modify: `src/core/codelens/commands.ts`
- Modify: `tests/beacon-commands.test.ts`
- Modify: `tests/codelens-commands.test.ts`
- Modify: `tests/package-metadata.test.ts`

**Interfaces:**

- New generated command key `commands.createIssue` equals `code-beacon.createIssue`.
- `useBeaconCommands()` registers `commands.createIssue` with `(annotation?: BeaconAnnotation) => Promise<void>`.

- [ ] **Step 1: Write failing command, CodeLens, and package tests**

Add a command test that calls the registered handler with an annotation, asserts `env.clipboard.writeText()` receives `formatBeaconIssue(annotation).body`, and asserts `window.showInformationMessage('Issue body copied to clipboard.')`. Add another test with no annotation that asserts no clipboard call and `window.showWarningMessage('Select a beacon in the Explorer to create an issue body.')`.

Add a CodeLens test asserting the generated commands include `commands.createIssue` with the annotation argument. Add package tests for the command contribution and Explorer beacon-item context menu contribution.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest tests/beacon-commands.test.ts tests/codelens-commands.test.ts tests/package-metadata.test.ts`

Expected: FAIL because `commands.createIssue` and its handler/contributions do not exist.

- [ ] **Step 3: Implement the command and contributions**

Add this command contribution and a `view/item/context` item gated by the existing beacon-item expression:

```json
{
  "category": "Code Beacon",
  "command": "code-beacon.createIssue",
  "title": "Create Issue Body"
}
```

Run `pnpm generate:meta`. In `useBeaconCommands`, import `formatBeaconIssue` and register an async handler that warns and returns for a missing annotation; otherwise awaits `env.clipboard.writeText(formatBeaconIssue(annotation).body)` then awaits `window.showInformationMessage(...)`. Do not catch clipboard failures. Add a `Create Issue` CodeLens descriptor with `[annotation]` arguments.

- [ ] **Step 4: Verify GREEN and commit**

Run: `pnpm vitest tests/beacon-commands.test.ts tests/codelens-commands.test.ts tests/package-metadata.test.ts && pnpm typecheck && pnpm format:check`

Expected: command registration, command behavior, UI metadata, and generated types pass.

Commit: `feat: add Create Issue body command`

### Task 3: Document, verify, and mark roadmap progress

**Files:**

- Modify: `README.md`
- Modify: `docs/plan.md`
- Modify: `tests/package-metadata.test.ts`

- [ ] **Step 1: Write a documentation expectation**

Extend package/document-focused coverage if needed to assert the new generated command remains in package metadata. Keep README wording explicit that the command copies a body and does not create a remote issue.

- [ ] **Step 2: Document the command**

Add `code-beacon.createIssue` to the README command table and a short usage note: select an Explorer beacon, invoke Create Issue Body, then edit/paste the copied GitHub-compatible Markdown. State that no issue tracker account or network request is used.

In `docs/plan.md`, mark only `Create Issue body generator` complete in Phase 3; leave changed-files scope, Source Control integration, and richer TreeView metadata pending.

- [ ] **Step 3: Verify full release quality**

Run: `pnpm release:check && pnpm build && pnpm generate:meta && git diff --exit-code -- src/meta.ts README.md && git diff --check`

Expected: all unit, desktop, Web, build, generation-idempotence, and diff checks pass.

- [ ] **Step 4: Commit**

Commit: `docs: document Create Issue body generator`
