# Generate Annotation Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in Generate Beacon Fix command that validates one model proposal locally and applies it only through VS Code confirmation.

**Architecture:** A pure module builds a bounded fix prompt, parses strict JSON, and turns a unique literal match into a single replacement plan. The command adapter obtains a model response, revalidates the current document, creates one `WorkspaceEdit`, and asks VS Code for confirmation via `workspace.applyEdit` metadata.

**Tech Stack:** TypeScript, VS Code Language Model API, WorkspaceEdit, Vitest, reactive-vscode, vscode-ext-gen.

## Global Constraints

- AI remains disabled by default and must be user-triggered.
- Only the selected annotation's one current document may be read; one replacement in that same URI is allowed.
- Model output is text only, never executable edits; reject anything except a strict `{ original, replacement, reason }` JSON object.
- `original` must be unique in the snapshot and contain the annotation keyword range; no multi-file, multi-range, resource, command, shell, Git, telemetry, scan, or automatic edit.
- Cap original at 12,000 and replacement at 8,000 UTF-16 code units; fail closed on document drift, cancellation, malformed JSON, ambiguity, or confirmation/apply rejection.
- Attach `{ label: 'Apply Code Beacon generated fix', needsConfirmation: true }` to the single `WorkspaceEdit.replace` entry, then use `workspace.applyEdit(edit)`; never apply another edit path.
- After package changes regenerate meta/README twice and require clean generated diff.

---

## Task 1: Pure fix proposal parsing and validation

**Files:**

- Create: `src/core/ai/generate-annotation-fix.ts`
- Create: `tests/ai-generate-annotation-fix.test.ts`

- [x] **Step 1: Write failing parser and planner tests.**

Cover exact JSON, fenced/non-object/unknown-field rejection, empty/oversized values, unique/missing/ambiguous literal matching, annotation-keyword containment, zero-based range conversion, and snapshot drift.

```ts
expect(
  parseGeneratedFix(
    '{"original":"TODO: old","replacement":"TODO: new","reason":"clarifies"}',
  ),
).toMatchObject({ ok: true })
expect(
  planGeneratedFix(annotation, 'const x = 1\n// TODO: old', proposal),
).toMatchObject({ ok: true, start: 12 })
```

- [x] **Step 2: Run the focused test and verify it fails.**

Run: `rtk pnpm vitest run tests/ai-generate-annotation-fix.test.ts`

Expected: module-not-found failure.

- [x] **Step 3: Implement pure prompt, parser, and plan APIs.**

Export deterministic `annotationFixPrompt`, `parseGeneratedFix`, and `planGeneratedFix`. Return discriminated results with stable failure codes instead of throwing for model text. Prompt every source/annotation field as untrusted data and request exact JSON only. A plan contains the snapshot text, URI-independent start/end offsets, replacement, and reason; it has no VS Code import.

- [x] **Step 4: Run focused tests and typecheck.**

Run: `rtk pnpm vitest run tests/ai-generate-annotation-fix.test.ts && pnpm typecheck`

- [x] **Step 5: Commit.**

```bash
rtk git add src/core/ai/generate-annotation-fix.ts tests/ai-generate-annotation-fix.test.ts
rtk git commit -m "feat: validate generated annotation fixes"
```

## Task 2: Generate Fix command with native confirmation

**Files:**

- Modify: `src/composables/use-beacon-commands.ts`
- Modify: `tests/beacon-commands.test.ts`

- [x] **Step 1: Add failing adapter tests.**

Test invalid/disabled arguments avoid access; model/document failures leave text unchanged; strict invalid proposals create no `WorkspaceEdit`; valid proposal creates exactly one same-URI replacement and calls `workspace.applyEdit` exactly once with `{ label: 'Apply Code Beacon generated fix', needsConfirmation: true }`; false result reports not applied; document drift before apply creates no edit. Reuse Explain's generation/cancellation rules and test stale/cancel paths.

- [x] **Step 2: Run command tests and verify they fail.**

Run: `rtk pnpm vitest run tests/beacon-commands.test.ts`

- [x] **Step 3: Implement command adapter.**

Register private `BEACON_GENERATE_FIX_COMMAND = 'code-beacon.generateFix'`. Reuse valid annotation/AI gate/current-document model path, buffer only text parts, parse/plan using Task 1, recheck generation and document text, build a new `WorkspaceEdit` with one `replace(Uri.parse(annotation.uri), new Range(...), replacement, { label: 'Apply Code Beacon generated fix', needsConfirmation: true })`, then call only `workspace.applyEdit(edit)`. Report all failures concisely without applying or retrying.

- [x] **Step 4: Run focused command/core/tool tests and typecheck.**

Run: `rtk pnpm vitest run tests/beacon-commands.test.ts tests/ai-generate-annotation-fix.test.ts tests/ai-explain-annotation.test.ts && pnpm typecheck`

- [x] **Step 5: Commit.**

```bash
rtk git add src/composables/use-beacon-commands.ts tests/beacon-commands.test.ts
rtk git commit -m "feat: add generate annotation fix command"
```

## Task 3: Manifest, generated metadata, and verification

**Files:**

- Modify: `package.json`
- Modify: `src/meta.ts`
- Modify: `README.md`
- Modify: `tests/package-metadata.test.ts`
- Modify: `docs/plan.md`

- [x] **Step 1: Write failing metadata tests.**

Assert `code-beacon.generateFix` directly after Explain with title `Generate Beacon Fix`, plus an Explorer beacon menu entry using the existing exact leaf `when` clause.

- [x] **Step 2: Run metadata tests and verify they fail.**

Run: `rtk pnpm vitest run tests/package-metadata.test.ts`

- [x] **Step 3: Contribute metadata and regenerate.**

Add the command/menu contribution. Run `rtk pnpm generate:meta`, stage generated outputs, rerun it, and require `rtk git diff --exit-code -- src/meta.ts README.md`.

- [x] **Step 4: Run broad verification.**

Run focused core/command/metadata tests, `pnpm typecheck`, `rtk pnpm test:unit`, and `rtk git diff --check`. Keep the combined explain/generate-fix/summarize roadmap item unchecked because Workspace Summary remains pending.

- [x] **Step 5: Commit.**

```bash
rtk git add package.json src/meta.ts README.md tests/package-metadata.test.ts docs/plan.md
rtk git commit -m "feat: contribute generate annotation fix command"
```

## Final Verification

- [ ] Run `rtk pnpm release:check` in the isolated worktree.
- [ ] Verify generated-output idempotence, clean diff/status, and a fresh whole-branch review.
- [ ] Merge only after review is clean, remove the worktree, rerun release verification on `main`, and mark this plan's final integration item complete.
