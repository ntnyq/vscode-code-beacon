# Generate Annotation Fix Design

## Goal

Add an opt-in, user-triggered `code-beacon.generateFix` command that asks a VS Code language model for one constrained replacement proposal for the selected annotation, validates it locally against the current document, and offers it through VS Code's native `WorkspaceEdit` confirmation flow.

## Decision

Generate Fix is a separate safety boundary from Explain. The model never receives write authority and never returns an executable `WorkspaceEdit`.

- Use the existing `code-beacon.ai.enabled` opt-in and the same user-initiated Copilot model selection, cancellation, supersession, and extension lifecycle guards as Explain. Do not persist or display raw model proposals.
- Read only the selected annotation's current document and send the same bounded nearby source window. Do not scan a workspace, read adjacent files, inspect Git, execute commands, or use telemetry.
- Require a single JSON object with `original`, `replacement`, and `reason` strings. Do not accept Markdown fences, arrays, multiple edits, file paths, ranges, snippets, commands, or tool calls.
- Locate `original` as an exact literal substring of the current document. It must occur exactly once and its range must contain the selected annotation's keyword range. The replacement is capped at 8,000 UTF-16 code units and the original at 12,000.
- Build a single-file, single-range `WorkspaceEdit.replace` whose entry metadata is `{ label: 'Apply Code Beacon generated fix', needsConfirmation: true }`, then call `workspace.applyEdit(edit)`. VS Code owns the preview/confirmation. A rejected confirmation or failed apply is reported as not applied.

## Alternatives Considered

### 1. Apply streamed model text directly

This is unsafe: model output is partial, non-deterministic, and cannot be anchored to the current document. Rejected.

### 2. Accept multi-file structured patches

Useful later, but substantially increases validation and confirmation complexity. It is out of scope for the first write-capable action.

### 3. Recommended: one anchored replacement with native confirmation

The model produces a small proposal; local code proves the target is unique and relevant; VS Code shows the change before applying it. This is comprehensible, testable, Web-compatible, and fail-closed.

## Model Contract

The prompt describes all annotation and source-window content as untrusted reference material. It requests exactly:

```json
{
  "original": "exact current text to replace",
  "replacement": "replacement text",
  "reason": "why this resolves the annotation"
}
```

The response collector buffers text only and permits surrounding whitespace but no Markdown fence. JSON parsing rejects non-object values, unknown/missing fields, non-string fields, empty `original`, empty `replacement`, and oversized values. The pure parser returns a discriminated result rather than throwing on model text.

## Runtime Flow

```text
selected beacon + explicit command
  -> validate annotation + AI opt-in
  -> supersede prior Generate Fix request
  -> open only annotation URI
  -> bounded prompt + select model + collect response text
  -> strict JSON parse + unique literal anchor validation
  -> single WorkspaceEdit.replace
  -> VS Code native confirmation/preview
  -> report applied, rejected, or invalid proposal
```

The command reads the opened document's current text and language ID. Before `workspace.applyEdit`, it verifies the generation is current and the document text still equals the snapshot used for validation; any intervening change aborts the proposal. It never applies an edit automatically outside VS Code's confirmation flow.

## Error Handling and Testing

- Invalid command input, disabled AI, document/model failures, cancellation, stale requests, malformed JSON, ambiguous/missing anchors, oversized values, document drift, confirmation rejection, and apply failure all leave the document unchanged and show concise messages.
- Pure tests cover prompt construction, JSON parsing, exact-field validation, literal uniqueness, annotation-range containment, range conversion, caps, and drift-safe plan construction.
- Adapter tests mock public VS Code APIs, including `WorkspaceEdit` and `workspace.applyEdit`; no real model or edit is used in tests.
- Package metadata contributes `Generate Beacon Fix` next to Explain and exposes it only for Explorer beacon items. The combined Phase 4 command milestone remains incomplete until Workspace Summary is also delivered.

## Non-Goals

This version does not edit multiple files, generate a diff format, create files, run tests/commands, automatically retry, persist model output, apply edits without VS Code confirmation, or infer a fix from unrelated workspace code.
