# Explain Annotation Command Design

## Goal

Add one opt-in, user-triggered `code-beacon.explain` command that sends a strictly bounded context for one Code Beacon annotation to a VS Code language model and streams a read-only explanation to the `Code Beacon AI` OutputChannel.

## Decision

Implement Explain before Generate Fix and Workspace Summary. Explain is read-only, scoped to one annotation, and establishes the direct Language Model API safety and UX contract that later AI commands can reuse.

- Use VS Code's direct Language Model API from a command, not a Language Model Tool or Chat Participant.
- Gate invocation with the existing `code-beacon.ai.enabled` setting, which remains false by default. Update its generated description to cover all Code Beacon AI features, not only read-only tools.
- Select an available Copilot model with `lm.selectChatModels({ vendor: 'copilot' })` only after the command is explicitly invoked. Do not pin a model family because available model IDs and families change.
- Read only the annotation's document, then send annotation metadata plus a capped nearby source window. Never scan the workspace, use Git metadata, write a file, apply an edit, or emit telemetry.
- Stream Markdown text to a dedicated output channel. The command does not create a chat participant, webview, untitled document, or code edit.

## Alternatives Considered

### 1. Extra Language Model Tool

An agent could call an explain tool during chat, but the route map explicitly calls for a user-facing command. It would also require the agent to choose the annotation and makes the output harder to discover outside chat.

### 2. Chat Participant

A participant provides rich conversational UX but adds a command grammar, participant lifecycle, chat context, tool orchestration, and model-selection semantics. That is disproportionate for the first direct AI action.

### 3. Recommended: direct command plus OutputChannel

The command is an explicit user action, so VS Code can request model consent at the correct point. An OutputChannel supports streaming, copyability, and simple error reporting without adding a custom UI or creating an editable artifact.

## Command Contract

`code-beacon.explain` accepts either a `BeaconAnnotation` or the existing Explorer leaf wrapper. It uses the same runtime validation as state-changing Explorer commands. If no valid annotation is supplied, it shows:

```text
Select a beacon in the Explorer to explain it.
```

If AI is disabled, it shows:

```text
Enable code-beacon.ai.enabled to explain annotations.
```

The package contributes the command as `Explain Beacon` and adds it to the Beacon Explorer item context menu. It is visible only for beacon leaf items and is not restricted to trusted workspaces: the user explicitly invokes it, and VS Code's model-consent flow remains authoritative.

## Bounded Context

The command opens only `Uri.parse(annotation.uri)`. It never calls a workspace scan or reads any unrelated document.

`src/core/ai/explain-annotation.ts` owns two pure operations:

1. `annotationExplanationPrompt(annotation, context)` produces a deterministic two-message prompt. The instruction requests: (a) a concise explanation, (b) concrete risks or ambiguity, and (c) options for handling it. It explicitly says the model must not claim to edit files or perform actions. The user message includes annotation fields needed for interpretation: keyword, message, category, severity, owner when nonempty, URI, one-based line/column, language ID, optional raw due/expiry fields, and the source window.
2. `annotationSourceWindow(documentText, annotation.line)` takes at most 60 lines before and 60 after the annotation line, includes one-based line numbers, and truncates the final string to 12,000 UTF-16 code units. A truncation marker is appended if content was capped. It accepts text and numbers only, so it has no VS Code dependency.

The command uses the opened document's current text and language ID. If opening the target document fails, it reports the error and makes no model request. The prompt contains no full workspace, other file content, annotation ranges, diagnostics objects, style data, Git metadata, email, ignored/resolved store state, or telemetry identifiers.

## Runtime Flow

```text
Explorer / CodeLens command
  -> validate annotation + AI opt-in
  -> open only annotation document
  -> build bounded pure context and prompt
  -> select available Copilot model (user-initiated consent)
  -> sendRequest with cancellable progress
  -> stream LanguageModelTextPart values to Code Beacon AI OutputChannel
```

The adapter uses `window.withProgress` with a cancellable notification. It creates the `Code Beacon AI` OutputChannel lazily, clears it for each command, writes a heading with the annotation location, appends streamed text chunks in order, and shows the channel once the first chunk arrives. It displays a concise error for unavailable models, `LanguageModelError` failures, document-read failures, cancellation, and unexpected failures. It never forwards the original exception text to the model.

The response is informational only. No `WorkspaceEdit`, `workspace.fs.writeFile`, command execution, mutation of the annotation store, or automatic follow-up action is allowed.

## Testing

- Pure tests cover one-based line windows, first/last-line boundaries, 60-line radius, 12,000-character truncation marker, prompt fields, optional owner/date omission, and exclusions.
- Command-adapter tests mock only public VS Code APIs. They prove invalid selection and disabled AI skip document/model access; document-open failure skips model selection; no-model and model errors produce messages; cancellation is passed through; streamed text reaches the OutputChannel in order; and no mutating VS Code API is invoked.
- Package metadata tests cover the new command title and Explorer menu visibility. Generated metadata is regenerated and tested for idempotence.
- Do not call a real language model in automated tests, because responses are nondeterministic and model calls consume quota.

## Non-Goals

This command does not generate or apply fixes, summarize the workspace, create an issue, invoke an agent tool, select a fixed model family, persist prompts/responses, send telemetry, inspect Git, or include neighboring files. Generate Fix requires a separate design for structured edits and preview; Workspace Summary requires a separate bounded aggregation design.
