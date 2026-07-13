# Explain Annotation Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the opt-in, read-only `code-beacon.explain` command that streams a bounded one-annotation explanation from a VS Code language model.

**Architecture:** A pure AI-core module owns source-window clipping and prompt construction. `useBeaconCommands` validates the existing annotation command argument, opens only its document, calls the Language Model API within cancellable progress, and streams only text response parts to an OutputChannel. Manifest contributions make the command discoverable from the Explorer and update the existing AI opt-in copy.

**Tech Stack:** TypeScript, VS Code Language Model API, reactive-vscode, Vitest, vscode-ext-gen, oxfmt.

## Global Constraints

- `code-beacon.ai.enabled` remains false by default and must be checked before document/model access.
- The command is user-triggered, read-only, and must not apply `WorkspaceEdit`, write files, mutate the annotation store, invoke commands, emit telemetry, inspect Git, or scan the workspace.
- Open only `Uri.parse(annotation.uri)` and send only that document's 60-line-before/after window, capped to 12,000 UTF-16 code units with a visible truncation marker.
- Select `lm.selectChatModels({ vendor: 'copilot' })` defensively after command invocation; do not pin a model family and do not call real models in tests.
- Group all deterministic prompt/window logic in a module with no VS Code imports.
- Preserve existing command and Language Model Tool behavior.
- After package changes, run `rtk pnpm generate:meta`, stage `src/meta.ts` and `README.md`, rerun it, then require `rtk git diff --exit-code -- src/meta.ts README.md`.
- Prefix shell commands with `rtk` except `pnpm typecheck`.

---

## Task 1: Build bounded explanation context and prompt core

**Files:**

- Create: `src/core/ai/explain-annotation.ts`
- Create: `tests/ai-explain-annotation.test.ts`

**Interfaces:**

- Produces `annotationSourceWindow(text, line)` and `annotationExplanationPrompt(annotation, sourceWindow)` for Task 2.

- [x] **Step 1: Write failing pure-core tests.**

Cover first/last document lines, the 60-line radius, one-based line labels, a 12,000-code-unit truncation marker, and prompt inclusion/exclusion:

```ts
expect(annotationSourceWindow('zero\none\ntwo', 1)).toBe(
  '1 | zero\n2 | one\n3 | two',
)

expect(
  annotationExplanationPrompt(
    annotation({ owner: ' Ada ', dueDate: '2026-08-01' }),
    '12 | // TODO: fix parser',
  ),
).toContain('Owner: Ada')
expect(
  annotationExplanationPrompt(annotation(), '12 | // TODO: fix parser'),
).not.toContain('Git')
```

Assert the instruction asks for explanation, risk/ambiguity, and options; forbids edit claims; and the prompt contains no ranges, diagnostics, style, email, document text outside the supplied window, or ignored/resolved state.

- [x] **Step 2: Verify the new core test fails.**

Run: `rtk pnpm vitest run tests/ai-explain-annotation.test.ts`

Expected: FAIL because `src/core/ai/explain-annotation.ts` does not exist.

- [x] **Step 3: Implement the pure core.**

Export these exact APIs:

```ts
export const BEACON_EXPLANATION_CONTEXT_LINE_RADIUS = 60
export const MAX_BEACON_EXPLANATION_CONTEXT_LENGTH = 12_000

export function annotationSourceWindow(text: string, line: number): string

export function annotationExplanationPrompt(
  annotation: BeaconAnnotation,
  sourceWindow: string,
): readonly [LanguageModelChatMessageData, LanguageModelChatMessageData]
```

Define `LanguageModelChatMessageData` locally as `{ readonly role: 'system' | 'user'; readonly content: string }`, so this module has no VS Code import. Clamp an out-of-range line to the nearest document line, number lines from one, and if the capped string is longer than the maximum replace its suffix with `\n[Code Beacon context truncated]`. Trim optional owner/due/expiry values before conditionally including them. Keep prompt wording deterministic and explicitly state that no code was changed.

- [x] **Step 4: Run core tests and typecheck.**

Run: `rtk pnpm vitest run tests/ai-explain-annotation.test.ts && pnpm typecheck`

Expected: PASS.

- [x] **Step 5: Commit the pure context slice.**

```bash
rtk git add src/core/ai/explain-annotation.ts tests/ai-explain-annotation.test.ts
rtk git commit -m "feat: build annotation explanation prompt"
```

## Task 2: Register the read-only streaming Explain command

**Files:**

- Modify: `src/composables/use-beacon-commands.ts`
- Modify: `tests/beacon-commands.test.ts`

**Interfaces:**

- Consumes Task 1 prompt data and existing `issueAnnotation` validation.
- Produces a handler registered under the private `BEACON_EXPLAIN_COMMAND = 'code-beacon.explain'` constant; Task 3 contributes the same ID and then generates `commands.explain` metadata.

- [x] **Step 1: Add failing command-adapter tests.**

Extend the VS Code mock with `lm`, `LanguageModelChatMessage`, `LanguageModelTextPart`, `LanguageModelError`, `ProgressLocation`, `Uri`, `window.createOutputChannel`, and `window.withProgress`. Test these exact outcomes:

```ts
await registeredCommand(commands.explain)()
expect(window.showWarningMessage).toHaveBeenCalledWith(
  'Select a beacon in the Explorer to explain it.',
)

configState.aiEnabled = false
await registeredCommand(commands.explain)(annotation)
expect(workspace.openTextDocument).not.toHaveBeenCalled()
expect(lm.selectChatModels).not.toHaveBeenCalled()
```

Also prove document-open failure skips model selection; no model emits an information message; an async stream of two `LanguageModelTextPart`s appends in order, shows the channel, and returns without mutation; model errors/cancellation report a concise message.

- [x] **Step 2: Verify focused command tests fail.**

Run: `rtk pnpm vitest run tests/beacon-commands.test.ts`

Expected: FAIL because `commands.explain` and its handler do not exist.

- [x] **Step 3: Implement command registration and streaming.**

Add private `BEACON_EXPLAIN_COMMAND = 'code-beacon.explain'` and a helper in `use-beacon-commands.ts` that validates `issueAnnotation`, gates `config.ai.enabled`, opens only `Uri.parse(annotation.uri)`, creates a source window/prompt, then selects the first Copilot model. Convert Task 1's data to `LanguageModelChatMessage.User` values; keep the system instruction as the first user message because the public API only exposes User/Assistant factory methods. Use `window.withProgress({ cancellable: true, location: ProgressLocation.Notification, title: 'Explaining Code Beacon annotation' }, async (_progress, token) => ...)` and pass `token` to `sendRequest`.

Create a lazy `Code Beacon AI` OutputChannel; call `clear()`, append a heading containing URI and one-based location, append only `LanguageModelTextPart.value` chunks, and call `show(true)` on the first text chunk. Catch expected language-model errors, cancellation, unavailable models, and document errors with `showWarningMessage`/`showInformationMessage`; never expose a stack trace or retry automatically.

- [x] **Step 4: Run command and relevant regression tests.**

Run: `rtk pnpm vitest run tests/beacon-commands.test.ts tests/ai-explain-annotation.test.ts tests/beacon-language-model-tools.test.ts && pnpm typecheck`

Expected: PASS; existing create-issue and tool tests retain their behavior.

- [x] **Step 5: Commit the command slice.**

```bash
rtk git add src/composables/use-beacon-commands.ts tests/beacon-commands.test.ts
rtk git commit -m "feat: add explain annotation command"
```

## Task 3: Contribute command metadata and regenerate documentation

**Files:**

- Modify: `package.json`
- Modify: `src/meta.ts`
- Modify: `README.md`
- Modify: `tests/package-metadata.test.ts`
- Modify: `docs/plan.md`

**Interfaces:**

- Consumes `commands.explain` from generated metadata and Task 2 registration.
- Produces a discoverable `Explain Beacon` command and Explorer item menu entry.

- [x] **Step 1: Write failing metadata tests.**

Require `code-beacon.explain` immediately after `code-beacon.createIssue` in the generated command list, and require a context menu item:

```ts
expect(pkg.contributes.menus?.['view/item/context']).toContainEqual({
  command: 'code-beacon.explain',
  when: 'view == codeBeacon.annotations && viewItem =~ /^beacon/',
})
```

Update the AI setting assertion to require copy that says it enables Code Beacon AI features and explains that direct commands send bounded annotation context only after a user action.

- [x] **Step 2: Verify metadata tests fail.**

Run: `rtk pnpm vitest run tests/package-metadata.test.ts tests/index.test.ts`

Expected: FAIL because the command and menu contribution do not exist.

- [x] **Step 3: Contribute metadata and regenerate outputs.**

Add `code-beacon.explain` with title `Explain Beacon`, add its Explorer context menu entry, and replace the AI setting description with:

```text
Enable Code Beacon AI features. Read-only Language Model Tools share only already-indexed annotations after confirmation; user-triggered AI commands send only bounded context for the selected annotation.
```

Run:

```bash
rtk pnpm generate:meta
rtk git add package.json src/meta.ts README.md
rtk pnpm generate:meta
rtk git diff --exit-code -- src/meta.ts README.md
```

- [x] **Step 4: Run broad verification and update the roadmap.**

Run:

```bash
rtk pnpm vitest run tests/ai-explain-annotation.test.ts tests/beacon-commands.test.ts tests/beacon-language-model-tools.test.ts tests/package-metadata.test.ts tests/index.test.ts
pnpm typecheck
rtk pnpm test:unit
rtk git diff --check
```

Expected: PASS. Do not mark the combined `explain/generate fix/summarize commands` Phase 4 item complete: Explain is only the first of those three commands.

- [x] **Step 5: Commit the manifest and generated slice.**

```bash
rtk git add package.json src/meta.ts README.md tests/package-metadata.test.ts docs/plan.md
rtk git commit -m "feat: contribute explain annotation command"
```

## Final Verification

- [x] Run `rtk pnpm release:check` in the isolated worktree.
- [x] Repeat metadata generation and require a clean generated-output diff.
- [x] Run `rtk git diff --check` and `rtk git status --short`.
- [x] Have a fresh reviewer inspect the pure prompt boundary, command safety, manifest, generated outputs, and complete feature diff before merge.
- [x] Merge only after review is clean, remove the worktree, rerun release verification on `main`, and mark this plan's final integration item complete.
