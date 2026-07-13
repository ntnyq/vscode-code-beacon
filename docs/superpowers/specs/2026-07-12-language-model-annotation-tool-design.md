# Language Model Annotation Tool Design

## Goal

Expose the annotations Code Beacon has already discovered to VS Code Agent mode through one opt-in, read-only Language Model Tool. The tool gives an agent structured, bounded context for later explanation, quality analysis, and fix-generation features without calling a model itself or modifying a workspace.

## Decision

Implement `code_beacon_list_annotations` first.

- Add `code-beacon.ai.enabled`, default `false`.
- Contribute and register one `code_beacon_list_annotations` tool only when the extension is activated; its `when` clause makes it available only while the opt-in setting is true.
- Return a JSON text result containing a bounded snapshot of annotations currently held in `annotationStore`; it never starts a scan, opens a document, invokes a language model, writes a file, invokes Git, reaches the network, or sends telemetry.
- Use `prepareInvocation` to name the selected scope and explain that the agent will receive already-indexed annotation metadata. The public extension-tool flow presents a confirmation before the tool runs.

## Alternatives Considered

### 1. Direct explain/generate-fix commands first

This immediately looks powerful but requires prompt composition, model availability/error handling, response rendering, and write-preview safeguards at the same time. It would mix context retrieval and model behavior before the context contract is testable.

### 2. Recommended: a bounded read-only annotation tool

The agent can use the current annotation snapshot in a chat conversation, while Code Beacon remains a deterministic data provider. The output schema and scope semantics can be fully unit-tested without a model. Later commands and tools can reuse the same selector and serializer.

### 3. Workspace-wide automatic scan on every invocation

This can be slow, expands file access, and is misleading in Web/Remote/Virtual Workspace cases. It is out of scope: the tool reports only what Code Beacon has already indexed.

## Tool Contract

### Manifest Identity

The `package.json` contribution is named `code_beacon_list_annotations`, uses `toolReferenceName: "codeBeaconAnnotations"`, and is referenceable in Agent chat. Its model description explicitly says it returns only annotations already in Code Beacon's in-memory store; it must not be used to search for unscanned annotations or read arbitrary file content.

The extension adds `onLanguageModelTool:code_beacon_list_annotations` beside the existing startup activation event so VS Code can activate it before invocation. At runtime it calls `lm.registerTool` with the same name and disposes the registration with the extension lifecycle.

### Input Schema

The tool accepts one optional object:

```ts
interface BeaconListAnnotationsInput {
  scope?: 'all' | 'activeFile' | 'openEditors'
  limit?: number
  includeResolved?: boolean
  includeIgnored?: boolean
}
```

- `scope` defaults to `all` and selects only from the current store: `activeFile` uses the active editor URI; `openEditors` uses visible editor URIs.
- `limit` defaults to `50`, with JSON schema minimum `1` and maximum `100`. Invalid values are defensively normalized to `50` even though VS Code validates contribution-schema input.
- Resolved and ignored annotations are excluded by default and included only when their respective flag is true.

### Output Schema

The tool returns one `LanguageModelTextPart` containing JSON:

```ts
interface BeaconListAnnotationsResult {
  annotations: readonly {
    id: string
    uri: string
    line: number
    column: number
    keyword: string
    message: string
    category: BeaconCategory
    severity: BeaconSeverity
    ruleId: string
    owner?: string
    resolved: boolean
    ignored: boolean
    source: BeaconAnnotation['source']
  }[]
  returned: number
  scope: 'all' | 'activeFile' | 'openEditors'
  total: number
  truncated: boolean
}
```

Annotations retain deterministic source-location ordering. Owners are trimmed, whitespace-only owners are omitted, and optional flags serialize as booleans. The result contains no code snippet, document text, Git metadata, email, workspace path enumeration, or data fetched outside the store.

## Architecture

```text
Agent prompt / #codeBeaconAnnotations
        |
        v
VS Code validates manifest input schema and asks user confirmation
        |
        v
useBeaconLanguageModelTools
        |
        +--> selectBeaconToolAnnotations (pure)
        |      current store + editor scope + state filters + deterministic limit
        |
        `--> serializeBeaconToolResult (pure)
               JSON snapshot -> LanguageModelTextPart -> LanguageModelToolResult
```

### Pure Core

`src/core/ai/list-annotations.ts` owns input normalization, scope/state filtering, sorting, owner normalization, bounded projection, and JSON serialization. It receives annotation arrays and explicit active/open URI context; it has no VS Code import. This module is the later shared source for workspace digest and quality scoring.

### VS Code Adapter

`src/composables/use-beacon-language-model-tools.ts` owns the public `lm.registerTool` call. It passes `annotationStore.getAll()`, `window.activeTextEditor?.document.uri.toString()`, and `window.visibleTextEditors` into the pure core. `prepareInvocation` has no side effects and returns an invocation message plus confirmation that describes the selected scope and maximum result count. `invoke` checks `config.ai.enabled` again, returns a useful error when disabled, and otherwise constructs the documented `LanguageModelToolResult`.

## Configuration and Compatibility

Add this generated setting:

```json
"code-beacon.ai.enabled": {
  "type": "boolean",
  "default": false,
  "description": "Enable Code Beacon's read-only Language Model Tools. Tools return only annotations already discovered by Code Beacon and require confirmation before sharing their result with an agent."
}
```

The extension keeps normal scanning, Explorer, Problems, Git, and Source Control behavior independent of agent availability. The setting is not restricted to trusted workspaces because this first tool reads only the already-held in-memory store and does not read files, run commands, or write data. It works in Web, Remote, Virtual Workspace, and no-Copilot situations; without a compatible chat/agent host it is simply unavailable rather than failing.

## Testing

- Pure selector tests cover defaults, all three scopes, source ordering, resolved/ignored flags, whitespace owner normalization, invalid limit fallback, max bound, and truncation.
- Serializer tests parse the returned JSON and assert the exact projection excludes code, Git, and document-content fields.
- Composable tests mock only public VS Code `lm`, `LanguageModelTextPart`, `LanguageModelToolResult`, `window`, and lifecycle APIs. They cover registration identity, confirmation/preparation, disabled invocation, all-scope invocation, and disposal.
- Package metadata tests cover configuration, `languageModelTools` contribution identity/schema/when clause, and the additional activation event.
- Release verification runs unit, desktop E2E, Web smoke, build, generated metadata idempotence, and diff checks.

## Safety and Explicit Non-Goals

This slice does not select or call a language model, generate an explanation, generate a fix, modify code, create a `WorkspaceEdit`, use `workspace.fs`, shell out, inspect Git, call a remote service, or emit telemetry. Explain, quality scoring, workspace digest, telemetry opt-in, and generate-fix preview remain separate Phase 4 deliverables after this read-only contract is proven.
