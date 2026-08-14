# Annotation Quality Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide deterministic annotation-quality scores, date metadata, and an opt-in read-only `annopulse_quality_check` Language Model Tool.

**Architecture:** The scanner owns owner/date-directive parsing and adds optional date fields to `AnnoPulseAnnotation`. A VS Code-independent quality module consumes those records with an explicit clock. A shared bounded selector feeds the existing list tool and the new quality tool, while the VS Code composable remains a thin registration, confirmation, and current-context adapter.

**Tech Stack:** TypeScript, Vitest, VS Code extension API, reactive-vscode, vscode-ext-gen, oxfmt.

## Global Constraints

- Keep quality evaluation deterministic, pure, and free of VS Code imports, I/O, model calls, Git calls, telemetry, workspace writes, and persisted scores.
- Preserve existing annotation behavior when no date directive is present; date fields are optional raw strings.
- Parse `due:` and `expires:` directives without silently accepting malformed dates; repeated directives use the last value.
- Use an explicit `Date` for scoring and compare valid `YYYY-MM-DD` dates by local calendar day.
- Continue to bound Language Model Tool results to the existing 1–100 selection contract and recheck `config.ai.enabled` synchronously before reading stores or editor state.
- Keep both tools read-only, confirmation-backed, compatible with Web/Remote/Virtual Workspace hosts, and free of source text, ranges, Git metadata, email, or model output.
- Run `rtk pnpm generate:meta` after changing `package.json`; stage generated `src/meta.ts` and `README.md`, then rerun the generator and require `rtk git diff --exit-code -- src/meta.ts README.md`.
- Prefix shell commands with `rtk` except `pnpm typecheck`.

---

## File Structure

- Modify: `src/types/annotation.ts` — optional raw `dueDate` and `expiresDate` annotation metadata.
- Modify: `src/core/scanner/scan-document.ts` — owner/date parsing and metadata propagation.
- Modify: `tests/scan-document.test.ts` — scanner date parsing coverage.
- Create: `src/core/quality/score-annotations.ts` — pure date validation, rubric, single-score, and collection-report API.
- Create: `tests/quality-score-annotations.test.ts` — deterministic rubric and report tests.
- Create: `src/core/ai/select-annotations.ts` — shared input normalization and bounded full-annotation selection.
- Modify: `src/core/ai/list-annotations.ts` — retain the public list API while reusing the shared selector and safe snapshot projection.
- Create: `src/core/ai/quality-check.ts` — safe quality-tool result construction and JSON serialization.
- Modify: `tests/ai-list-annotations.test.ts` — date projection and selector regression tests.
- Create: `tests/ai-quality-check.test.ts` — bounded quality-result serialization tests.
- Modify: `src/composables/use-annotation-language-model-tools.ts` — register, confirm, guard, and invoke both read-only tools.
- Modify: `package.json` — add quality-tool contribution and activation event.
- Modify: `src/meta.ts` and `README.md` — generator outputs.
- Modify: `tests/annotation-language-model-tools.test.ts` and `tests/package-metadata.test.ts` — adapter and manifest coverage.
- Modify: `docs/plan.md` — mark the quality-scoring roadmap item complete only after all verification passes.

## Task 1: Scan and retain date directives

**Files:**

- Modify: `src/types/annotation.ts:115-140`
- Modify: `src/core/scanner/scan-document.ts:108-219, 300-325`
- Modify: `tests/scan-document.test.ts`

**Interfaces:**

- Produces `AnnoPulseAnnotation['dueDate']?: string` and `AnnoPulseAnnotation['expiresDate']?: string`.
- Existing `scanDocument(options)` callers receive the new optional fields automatically; no caller must parse comment text.

- [x] **Step 1: Write failing scanner tests for valid, malformed, repeated, and multiline directives.**

```ts
it('extracts owner and date directives while preserving the message', () => {
  const [annotation] = scanDocument({
    commentOnly: true,
    languageId: 'typescript',
    maxFileSize: 1_000_000,
    rules,
    source: 'visibleEditor',
    text: '// TODO(alice): due:2026-08-01 add retry limit expires:2026-09-01',
    uri: 'file:///workspace/dates.ts',
  }).annotations

  expect(annotation).toMatchObject({
    dueDate: '2026-08-01',
    expiresDate: '2026-09-01',
    message: 'add retry limit',
    owner: 'alice',
  })
})

it('retains malformed values and lets the last duplicate directive win', () => {
  const [annotation] = scanDocument({
    commentOnly: true,
    languageId: 'typescript',
    maxFileSize: 1_000_000,
    rules,
    source: 'visibleEditor',
    text: '// TODO: due:2026-01-01 document cache expires:2026-12-01 due:not-a-date behavior',
    uri: 'file:///workspace/dates.ts',
  }).annotations

  expect(annotation).toMatchObject({
    dueDate: 'not-a-date',
    expiresDate: '2026-12-01',
    message: 'document cache behavior',
  })
})
```

Include a multiline case proving directives are removed from the first and follow-up lines without collapsing the remaining message order.

- [x] **Step 2: Run the focused scanner tests and verify they fail because date metadata is absent.**

Run: `rtk pnpm vitest run tests/scan-document.test.ts`

Expected: FAIL with missing `dueDate`/`expiresDate` assertions.

- [x] **Step 3: Add optional raw date fields and a single parser for owner/message/date metadata.**

In `AnnoPulseAnnotation`, add:

```ts
readonly dueDate?: string
readonly expiresDate?: string
```

Replace the owner-only return shape with one parser used by `extractMessage`:

```ts
interface ParsedAnnotationMessage {
  readonly message: string
  readonly owner?: string
  readonly dueDate?: string
  readonly expiresDate?: string
}

function parseAnnotationMessage(value: string): ParsedAnnotationMessage
```

First apply the current owner-prefix rules. Then use a global, case-insensitive directive matcher for `due:` and `expires:` tokens, collect each raw non-whitespace value, remove each token plus one adjacent separator space, and trim separator leftovers. Assign later occurrences over earlier ones. Return the untouched message when no directive is present. Propagate both optional fields from `ExtractedMessage` into the annotation object in `scanRange`.

- [x] **Step 4: Run scanner and relevant type tests.**

Run: `rtk pnpm vitest run tests/scan-document.test.ts tests/annotation-store.test.ts`

Expected: PASS; existing owner and multiline tests continue to pass.

- [x] **Step 5: Commit the scanner metadata slice.**

```bash
rtk git add src/types/annotation.ts src/core/scanner/scan-document.ts tests/scan-document.test.ts
rtk git commit -m "feat: capture annotation date directives"
```

## Task 2: Build the deterministic quality evaluator

**Files:**

- Create: `src/core/quality/score-annotations.ts`
- Create: `tests/quality-score-annotations.test.ts`

**Interfaces:**

- Consumes `AnnoPulseAnnotation` from Task 1 and `compareAnnoPulseAnnotations` from `src/core/explorer/filter.ts`.
- Produces `scoreAnnoPulseAnnotation(annotation, now)` and `scoreAnnoPulseAnnotations(annotations, options)` for Task 3.

- [x] **Step 1: Write failing tests for the complete scoring contract.**

Define a local annotation factory and cover the following exact expectations:

```ts
expect(
  scoreAnnoPulseAnnotation(annotation({ message: '' }), now),
).toMatchObject({
  score: 40,
  level: 'poor',
  issues: [
    { code: 'emptyMessage', penalty: 45 },
    { code: 'missingOwner', penalty: 15 },
  ],
})

expect(
  scoreAnnoPulseAnnotation(annotation({ message: 'later' }), now).issues,
).toEqual(expect.arrayContaining([{ code: 'vagueMessage', penalty: 25 }]))

expect(
  scoreAnnoPulseAnnotation(annotation({ message: 'update', owner: 'Ada' }), now)
    .issues,
).toEqual(expect.arrayContaining([{ code: 'missingContext', penalty: 15 }]))

expect(
  scoreAnnoPulseAnnotation(
    annotation({
      dueDate: '2026-02-29',
      expiresDate: '2026-01-01',
      message: 'add retry limit',
      owner: 'Ada',
    }),
    new Date(2026, 0, 2),
  ).issues,
).toEqual([
  expect.objectContaining({ code: 'invalidDueDate', penalty: 10 }),
  expect.objectContaining({ code: 'expired', penalty: 25 }),
])
```

Also cover leap day validity, today-not-overdue behavior, score clamping, levels at 80/50 boundaries, issue suppression, `note` behavior, sorted collection output, default resolved/ignored filtering, opt-in inclusion, and aggregate level counts.

- [x] **Step 2: Run the focused evaluator tests and verify they fail because the module does not exist.**

Run: `rtk pnpm vitest run tests/quality-score-annotations.test.ts`

Expected: FAIL with module-not-found.

- [x] **Step 3: Implement the pure scoring API.**

Create the exported contract:

```ts
export type AnnoPulseQualityLevel = 'good' | 'needsAttention' | 'poor'
export type AnnoPulseQualityIssueCode =
  | 'emptyMessage'
  | 'vagueMessage'
  | 'missingAction'
  | 'missingContext'
  | 'missingOwner'
  | 'invalidDueDate'
  | 'invalidExpiresDate'
  | 'overdue'
  | 'expired'

export interface AnnoPulseQualityIssue {
  readonly code: AnnoPulseQualityIssueCode
  readonly message: string
  readonly penalty: number
}

export interface AnnoPulseAnnotationQuality {
  readonly annotationId: string
  readonly issues: readonly AnnoPulseQualityIssue[]
  readonly level: AnnoPulseQualityLevel
  readonly score: number
}

export interface AnnoPulseQualityReport {
  readonly annotations: readonly AnnoPulseAnnotationQuality[]
  readonly counts: Readonly<Record<AnnoPulseQualityLevel, number>>
}

export interface ScoreAnnoPulseAnnotationsOptions {
  readonly includeIgnored?: boolean
  readonly includeResolved?: boolean
  readonly now: Date
}
```

Implement strict date parsing with a `YYYY-MM-DD` regexp plus `new Date(year, month - 1, day)` round-trip validation. Compare local calendar triples, never timestamp strings. Normalize punctuation/whitespace for the empty, vague, action, and meaningful-term checks. Use the fixed penalties and issue order from the design; suppress vague/action/context after empty and action/context after vague. Treat every category except `note` as task-oriented. Sort the collection's source annotations before scoring, then calculate exactly one count for each returned level.

- [x] **Step 4: Run quality tests and the full unit suite.**

Run: `rtk pnpm vitest run tests/quality-score-annotations.test.ts && rtk pnpm test:unit`

Expected: PASS with no changed behavior in pre-existing scanner/store tests.

- [x] **Step 5: Commit the pure quality engine.**

```bash
rtk git add src/core/quality/score-annotations.ts tests/quality-score-annotations.test.ts
rtk git commit -m "feat: score annotation quality"
```

## Task 3: Share bounded selection and serialize quality results

**Files:**

- Create: `src/core/ai/select-annotations.ts`
- Modify: `src/core/ai/list-annotations.ts`
- Create: `src/core/ai/quality-check.ts`
- Modify: `tests/ai-list-annotations.test.ts`
- Create: `tests/ai-quality-check.test.ts`

**Interfaces:**

- Consumes Task 2's `scoreAnnoPulseAnnotations` and existing `AnnoPulseAnnotation` data.
- Produces `selectAnnoPulseAnnotations`, existing `listAnnoPulseAnnotations`, and `createAnnoPulseQualityCheck`/`serializeAnnoPulseQualityCheck` for Task 4.

- [x] **Step 1: Write failing tests for shared selection and safe quality JSON.**

Add list-tool assertions that optional dates are projected exactly when present and no unsafe annotation fields appear. Add quality-check tests that select an active-file snapshot with a limit, assert `returned`, `total`, and `truncated`, and parse JSON to assert the schema:

```ts
expect(result).toMatchObject({
  annotations: [
    {
      annotation: expect.objectContaining({ id: 'a', dueDate: '2026-08-01' }),
      level: 'needsAttention',
      score: 70,
    },
  ],
  counts: { good: 0, needsAttention: 1, poor: 0 },
  returned: 1,
  scope: 'activeFile',
  total: 2,
  truncated: true,
})
```

Assert JSON excludes `range`, `keywordRange`, `messageRange`, `style`, `diagnostics`, Git data, document text, and email.

- [x] **Step 2: Run focused AI-core tests and verify the quality module is missing.**

Run: `rtk pnpm vitest run tests/ai-list-annotations.test.ts tests/ai-quality-check.test.ts`

Expected: FAIL with module-not-found for `quality-check`.

- [x] **Step 3: Extract one shared full-annotation selector without changing list semantics.**

Create `select-annotations.ts` with the currently public input, context, normalization, default/max constants, and a result containing the sorted, state/scope-filtered full annotations plus `scope`, `returned`, `total`, and `truncated`. Re-export the current input and scope types/constants from `list-annotations.ts` to preserve its imports. Keep owner trimming and safe annotation projection in `list-annotations.ts`, adding optional `dueDate` and `expiresDate` only when their trimmed values are nonempty.

- [x] **Step 4: Build quality-tool result construction on those shared primitives.**

Create `quality-check.ts` with:

```ts
export function createAnnoPulseQualityCheck(
  annotations: readonly AnnoPulseAnnotation[],
  input: AnnoPulseListAnnotationsInput,
  context: AnnoPulseListAnnotationsContext,
  now: Date,
): AnnoPulseQualityCheckResult

export function serializeAnnoPulseQualityCheck(
  result: AnnoPulseQualityCheckResult,
): string
```

Select once, score exactly the selected annotations with resolved/ignored inclusion enabled because selection already applied those flags, and join each quality record to the same safe annotation projection. Retain selector metadata and use the report's aggregate counts. `JSON.stringify` is the serializer; it must not include full annotation internals.

- [x] **Step 5: Run AI-core tests and a typecheck.**

Run: `rtk pnpm vitest run tests/ai-list-annotations.test.ts tests/ai-quality-check.test.ts && pnpm typecheck`

Expected: PASS; list-tool scopes, defaults, ordering, limits, and state filtering remain unchanged.

- [x] **Step 6: Commit the shared AI-core slice.**

```bash
rtk git add src/core/ai/select-annotations.ts src/core/ai/list-annotations.ts src/core/ai/quality-check.ts tests/ai-list-annotations.test.ts tests/ai-quality-check.test.ts
rtk git commit -m "feat: expose bounded annotation quality results"
```

## Task 4: Contribute and register the read-only quality tool

**Files:**

- Modify: `src/composables/use-annotation-language-model-tools.ts`
- Modify: `package.json`
- Modify: `src/meta.ts`
- Modify: `README.md`
- Modify: `tests/annotation-language-model-tools.test.ts`
- Modify: `tests/package-metadata.test.ts`
- Modify: `docs/plan.md:766-772`

**Interfaces:**

- Consumes Task 3's `createAnnoPulseQualityCheck` and `serializeAnnoPulseQualityCheck`.
- Produces `ANNOPULSE_QUALITY_CHECK_TOOL_NAME = 'annopulse_quality_check'` and a user-visible opt-in tool contribution.

- [x] **Step 1: Write failing adapter and metadata tests for the second tool.**

Update mocks so registration is indexed by tool name. Assert both names register and dispose, then add these expectations:

```ts
expect(registerTool).toHaveBeenCalledWith(
  'annopulse_quality_check',
  expect.objectContaining({
    invoke: expect.any(Function),
    prepareInvocation: expect.any(Function),
  }),
)

expect(
  qualityTool.prepareInvocation?.(
    { input: { limit: 2, scope: 'openEditors' } },
    cancellationToken,
  ),
).resolves.toMatchObject({
  confirmationMessages: { title: 'Share AnnoPulse annotation quality' },
  invocationMessage:
    'Checking up to 2 AnnoPulse annotations from open editors.',
})
```

Prove disabled quality invocation throws before reading `annotationStore` or editor getters. With tools enabled, assert active-file/open-editor scope and the JSON quality result. In package tests assert two alphabetical activation events and two tool contributions; the new contribution uses name `annopulse_quality_check`, reference `annopulseAnnotationQuality`, `$(checklist)` icon, `config.annopulse.ai.enabled`, `read-only` tag, and the same bounded input schema.

- [x] **Step 2: Run adapter and metadata tests and verify they fail.**

Run: `rtk pnpm vitest run tests/annotation-language-model-tools.test.ts tests/package-metadata.test.ts`

Expected: FAIL because the quality tool and manifest contribution do not exist.

- [x] **Step 3: Register two tools through a shared adapter helper.**

Keep the current list tool contract byte-for-byte in behavior. Extract a local factory/helper only for common disabled-guard and current-context snapshot acquisition. Register `annopulse_quality_check` with a preparation message and confirmation that say “quality” rather than “listing”. Its `invoke` must synchronously throw the exact existing disabled-tools error before acquiring the snapshot, then call `createAnnoPulseQualityCheck(..., new Date())`, serialize it, and return one `LanguageModelTextPart` in `LanguageModelToolResult`.

- [x] **Step 4: Add the manifest contribution and regenerate metadata.**

Add `onLanguageModelTool:annopulse_quality_check` in alphabetical order with the existing tool event. Add a `languageModelTools` entry with the exact identity from Step 1, a model description that says scores are deterministic and derived only from already-indexed annotations, and the same input schema/defaults as the list tool. Run:

```bash
rtk pnpm generate:meta
rtk git add package.json src/meta.ts README.md
rtk pnpm generate:meta
rtk git diff --exit-code -- src/meta.ts README.md
```

- [x] **Step 5: Run focused and broad verification, then complete the roadmap checkbox.**

Run:

```bash
rtk pnpm vitest run tests/annotation-language-model-tools.test.ts tests/package-metadata.test.ts tests/ai-list-annotations.test.ts tests/ai-quality-check.test.ts tests/quality-score-annotations.test.ts tests/scan-document.test.ts
pnpm typecheck
rtk pnpm test:unit
rtk git diff --check
```

Expected: all commands pass. Only then change `docs/plan.md` from `- [ ] TODO quality scoring。` to `- [x] TODO quality scoring。`.

- [x] **Step 6: Commit the user-facing quality tool and roadmap status.**

```bash
rtk git add src/composables/use-annotation-language-model-tools.ts package.json src/meta.ts README.md tests/annotation-language-model-tools.test.ts tests/package-metadata.test.ts docs/plan.md
rtk git commit -m "feat: add annotation quality check tool"
```

## Final Verification

- [x] Run `rtk pnpm release:check` from the isolated worktree after the feature commits.
- [x] Run `rtk pnpm generate:meta`, stage generated outputs, rerun it, and require `rtk git diff --exit-code -- src/meta.ts README.md`.
- [x] Run `rtk git diff --check` and `rtk git status --short`.
- [x] Have a fresh reviewer inspect the implementation, test coverage, manifest, generated outputs, and final diff before merging.
- [x] Merge only after the reviewer has no blocking findings; remove the feature worktree, rerun release verification on `main`, and update this plan's task checkboxes and the Phase 4 roadmap status only when evidence is green.
