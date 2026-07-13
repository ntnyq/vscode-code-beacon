# Annotation Quality Scoring Design

## Goal

Make Code Beacon able to evaluate the quality of its existing annotation records without a language model. The result must identify the concrete reason an actionable annotation is incomplete or stale: no usable message, too little context, no clear action, no owner, malformed date metadata, an overdue due date, or an expired expiry date.

The score is exposed through the opt-in, read-only `code_beacon_quality_check` Language Model Tool. The extension does not call a model itself, read files outside its current annotation store, modify annotations, add Explorer UI, or emit telemetry.

## Decision

Use a pure, deterministic rubric plus scanner-owned date metadata.

- The scanner recognizes `due:YYYY-MM-DD` and `expires:YYYY-MM-DD` directives in an annotation message, stores their raw values on the annotation, and removes recognized directives from the display message. Directives may appear after the optional owner prefix or later in the message.
- The scanner does not silently treat a malformed calendar date as valid. It retains the raw directive value so the quality evaluator can report it.
- The evaluator accepts annotations and an explicit current time. It returns a bounded `0`–`100` score, a stable quality level, and ordered findings with machine-readable codes and fixed penalties.
- Quality is advisory. It never changes `resolved`, `ignored`, owners, dates, document text, or rules. Resolved and ignored annotations are excluded from aggregate reports by default, but evaluating one directly remains possible.
- The existing opt-in Language Model Tool adapter contributes `code_beacon_quality_check`. It reuses the list tool's scope and state inputs, asks for confirmation, evaluates only the bounded current-store snapshot, and returns structured JSON rather than invoking a model.

## Alternatives Considered

### 1. Model-only scoring

A language model could infer intent from nearby code, but it would make scores non-deterministic, require opt-in/model availability, expand the data shared with an agent, and be hard to test. It is inappropriate for a core quality signal.

### 2. Recommended: deterministic rules with structured findings

Simple structural rules are explainable, work offline in desktop, Web, Remote, and Virtual Workspace hosts, and can be reused by the Explorer, exports, workspace digest, and an AI tool. The rules deliberately avoid claiming to understand business semantics.

### 3. Rules followed by optional model review

This can later help explain a finding or suggest a rewrite, but it needs a dependable deterministic baseline first. It remains a later AI interaction, not part of this score.

## Annotation Metadata

`BeaconAnnotation` gains optional `dueDate` and `expiresDate` strings. Each holds the raw value captured from a `due:` or `expires:` directive; it is present whether the value is valid or malformed. A valid date is exactly a real Gregorian calendar date in `YYYY-MM-DD` form, interpreted at the start of that date in the local calendar used by the evaluator.

The scanner continues to recognize existing owners such as `TODO(alice):`, `TODO @alice:`, and `TODO [owner=alice]:`. It then extracts date directives while preserving the rest of a multiline message. Repeated directives use the last occurrence, so the annotation has one unambiguous value for each field. A directive's surrounding separator whitespace is removed; ordinary message text remains in its original order.

Examples:

```text
// TODO(alice): due:2026-08-01 add retry limit
// FIXME: remove fallback expires:2026-01-01
// TODO: due:not-a-date explain cache invalidation
```

These produce, respectively: owner `alice` plus message `add retry limit` and `dueDate: "2026-08-01"`; message `remove fallback` and `expiresDate: "2026-01-01"`; and message `explain cache invalidation` with `dueDate: "not-a-date"`.

## Quality Contract

`src/core/quality/score-annotations.ts` owns a VS Code-independent API:

```ts
type BeaconQualityIssueCode =
  | 'emptyMessage'
  | 'vagueMessage'
  | 'missingAction'
  | 'missingContext'
  | 'missingOwner'
  | 'invalidDueDate'
  | 'invalidExpiresDate'
  | 'overdue'
  | 'expired'

interface BeaconAnnotationQuality {
  annotationId: string
  score: number
  level: 'good' | 'needsAttention' | 'poor'
  issues: readonly BeaconQualityIssue[]
}
```

The public module also exports a collection evaluator that filters resolved and ignored annotations by default, sorts annotations by the existing source-location comparator, and reports counts by level. Callers supply `now` rather than relying on system time, so a result is reproducible.

### Rubric

Every eligible annotation starts at 100. Findings are emitted in the order below, and the score is clamped to `0`.

| Finding                                 | Condition                                                                                                               | Penalty |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------: |
| `emptyMessage`                          | Message has no non-punctuation content.                                                                                 |      45 |
| `vagueMessage`                          | Nonempty message is a known standalone placeholder (for example `todo`, `fixme`, `later`, `something`, `处理`, `以后`). |      25 |
| `missingAction`                         | A task-oriented annotation has a nonempty message but no recognizable action phrase.                                    |      15 |
| `missingContext`                        | A task-oriented annotation has an action but fewer than two meaningful terms after normalizing punctuation.             |      15 |
| `missingOwner`                          | A task-oriented annotation has no non-whitespace owner.                                                                 |      15 |
| `invalidDueDate` / `invalidExpiresDate` | The corresponding captured directive is not a real `YYYY-MM-DD` date.                                                   | 10 each |
| `overdue`                               | A valid due date is before the supplied current calendar day.                                                           |      20 |
| `expired`                               | A valid expiry date is before the supplied current calendar day.                                                        |      25 |

`emptyMessage` suppresses the vague/action/context checks, and `vagueMessage` suppresses action/context checks, so the same absence is not charged repeatedly. A task-oriented annotation is any category except `note`; note annotations can still report empty messages and date defects, but do not require an action, context, or owner.

The action phrase matcher is intentionally a small documented lexical heuristic, not an NLP classifier. It recognizes common English imperative verbs (`add`, `remove`, `fix`, `replace`, `refactor`, `investigate`, `document`, `update`, `verify`, and related inflections) and common Chinese task verbs (`添加`, `删除`, `修复`, `重构`, `检查`, `更新`, `处理`, `补充`, `验证`). The implementation keeps this list private so the public contract is finding codes, not a promise that every natural-language verb will be recognized.

Levels are `good` for 80–100, `needsAttention` for 50–79, and `poor` for 0–49. A finding exposes its code, fixed penalty, and a concise user-facing remediation message; it does not expose code text or call an AI service.

## Data Flow

```text
document text
  -> scanner parses owner + due/expires directives
  -> BeaconAnnotation { message, owner?, dueDate?, expiresDate? }
  -> pure quality evaluator + explicit now
  -> score, level, ordered remediation findings
  -> future Explorer / quality tool / digest consumers
```

The scanner is the only component that understands raw directive syntax. The evaluator only reads the normalized annotation object. This keeps future consumers from independently parsing comment text and allows existing store, workspace scan, notebook, and editor paths to gain the same metadata automatically.

## Language Model Tool Contract

The manifest contributes `code_beacon_quality_check` with the reference name `codeBeaconAnnotationQuality`, beside the existing list tool. It uses the same opt-in `config.code-beacon.ai.enabled` `when` clause and the `onLanguageModelTool:code_beacon_quality_check` activation event. Its input schema is the existing bounded annotation selector: `scope` (`all`, `activeFile`, or `openEditors`), `limit` (1–100), `includeResolved`, and `includeIgnored`.

`useBeaconLanguageModelTools` shares one snapshot-selection path between the list and quality tools. `prepareInvocation` reports the selected scope and maximum number of already-indexed annotations, then requests confirmation before an agent receives the result. `invoke` rechecks the opt-in setting synchronously, reads the current store/editor context only after that check, selects annotations with the existing bounded selector, and passes the selected annotations plus `new Date()` to the pure evaluator.

The text result is JSON containing the selector metadata (`scope`, `returned`, `total`, `truncated`), the quality aggregate, and one quality record per returned annotation. Each record includes the same safe annotation projection used by the list tool plus `score`, `level`, and issue objects. No document text, ranges, Git metadata, email, model response, or workspace write capability is exposed.

## Compatibility and Safety

- Existing annotations with no date fields remain valid and receive no date finding.
- Date directives are metadata, not state: adding one does not resolve, ignore, or mutate an annotation.
- The evaluator imports no VS Code API and performs no I/O, Git lookup, workspace scan, or model invocation.
- Scores are not persisted in memento state. They are derived from current annotations and the supplied time, preventing stale quality state.
- The list and quality tools project normalized date fields only when present; both remain read-only and bounded.

## Testing

- Scanner tests cover owner-plus-date parsing, both directive kinds, multiline messages, duplicate directive precedence, whitespace cleanup, and malformed value retention.
- Quality-unit tests cover every finding, finding suppression, score clamping, levels, non-task `note` behavior, valid leap-day handling, invalid calendar dates, calendar-boundary comparisons, resolved/ignored collection filtering, deterministic ordering, and aggregate counts.
- List-tool tests prove valid and malformed captured date values are serialized only as explicit metadata, alongside the existing projection and bounds guarantees.
- Tool-adapter and metadata tests cover the quality tool's identity, activation event, schema, opt-in guard, confirmation, bounded scope behavior, JSON result, and disposal alongside the existing list tool.
- Existing scanner, store, workspace, desktop, and Web verification remains part of release validation to prove all scan sources preserve the added optional fields.

## Non-Goals

This slice does not decide whether a task is actually important, infer an owner from Git, inspect nearby code, show a quality badge in the Explorer, call a language model, rewrite comments, generate fixes, or collect telemetry. Those consumers come after this deterministic scoring contract and read-only quality tool are implemented and verified.
