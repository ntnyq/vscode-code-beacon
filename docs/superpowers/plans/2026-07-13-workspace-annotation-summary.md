# Workspace Annotation Summary Implementation Plan

**Goal:** Add a user-triggered, opt-in, read-only AI command that streams a bounded summary of already-indexed workspace annotations.

**Architecture:** A VS Code-free module deterministically selects/project/caps annotation data and builds an injection-resistant prompt. The command adapter snapshots only `annotationStore`, uses independent request lifecycle guards, and streams text-only model output to a dedicated Summary OutputChannel so it cannot clear or mix Explain output. Package metadata exposes the command in the Command Palette and regenerates typed/docs output.

**Tech Stack:** TypeScript, Vitest, VS Code Language Model API, reactive-vscode, vscode-ext-gen.

## Global Constraints

- AI remains disabled by default and the command is explicitly user-triggered.
- Read only `annotationStore`; do not scan/open/read documents, use Git/filesystem/tools, mutate state, apply edits, or emit telemetry.
- Default to unresolved, non-ignored annotations; deterministic selection max 100 and prompt payload max 12,000 UTF-16 code units.
- Treat all annotation fields as untrusted and never send source text.
- Keep Summary request/cancellation/output lifecycle separate from Explain and Generate Fix.
- Generate `src/meta.ts` and README only through `rtk pnpm generate:meta`; verify idempotence.

## Task 1: Pure bounded summary payload and prompt

**Files:**

- Create: `src/core/ai/workspace-annotation-summary.ts`
- Create: `tests/ai-workspace-annotation-summary.test.ts`

- [x] Write failing tests for deterministic selection/state filtering, aggregate category/severity counts, compact projection, UTF-16-safe 12,000-code-unit cap, truncation accounting, no source-text field, and untrusted prompt boundaries.
- [x] Verify RED with `rtk pnpm vitest run tests/ai-workspace-annotation-summary.test.ts`.
- [x] Implement pure `createWorkspaceAnnotationSummary` and `workspaceAnnotationSummaryPrompt` APIs without VS Code imports. Return stable data including total/returned/sent/truncated/counts/annotations and a bounded serialized payload.
- [x] Verify focused tests, `pnpm typecheck`, formatter, and diff check; commit `feat: build workspace annotation summary prompt`.

## Task 2: Read-only Summary command

**Files:**

- Modify: `src/composables/use-beacon-commands.ts`
- Modify: `tests/beacon-commands.test.ts`

- [x] Add failing adapter tests for disabled AI/empty index, no document access, model selection/request failures, bounded prompt/current store snapshot, text-only streaming, cancellation, stale Summary request, lifecycle disposal, and Explain/Generate Fix isolation.
- [x] Verify RED with `rtk pnpm vitest run tests/beacon-commands.test.ts`.
- [x] Register private `code-beacon.summarizeWorkspace`; snapshot `annotationStore.getAll()`, use pure payload/prompt, stream only `LanguageModelTextPart` to a dedicated `Code Beacon Workspace Summary` output channel, and apply separate Summary generation/disposal guards. Do not write through any VS Code edit API.
- [x] Verify focused command/core tests, `pnpm typecheck`, formatter/lint, and diff check; commit `feat: add workspace annotation summary command`.

## Task 3: Command contribution, generated metadata, and verification

**Files:**

- Modify: `package.json`
- Modify: `src/meta.ts`
- Modify: `README.md`
- Modify: `tests/package-metadata.test.ts`
- Modify: `docs/plan.md`

- [x] Add failing metadata tests for `code-beacon.summarizeWorkspace` immediately after Generate Fix with title `Summarize Workspace Beacons`; do not add an Explorer item-context entry.
- [x] Add the command contribution, regenerate meta/README twice, and require clean generated diff.
- [x] Update the combined Phase 4 command milestone to complete only after all three commands exist; leave telemetry unchecked.
- [x] Run focused suites, `pnpm typecheck`, `rtk pnpm test:unit`, `rtk pnpm release:check`, and `rtk git diff --check`; commit `feat: contribute workspace annotation summary command`.

## Final Verification

- [ ] Review the whole branch for source-read/write and lifecycle regressions.
- [ ] Merge only after clean spec/code review; remove worktree, rerun release verification on `main`, and mark this plan’s final integration item complete.
