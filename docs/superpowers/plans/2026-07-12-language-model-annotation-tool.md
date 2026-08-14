# Language Model Annotation Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in, read-only `annopulse_list_annotations` Language Model Tool that returns a bounded JSON projection of annotations AnnoPulse has already indexed.

**Architecture:** A pure core selects, normalizes, sorts, bounds, and serializes annotation snapshots without VS Code APIs. A small composable registers the manifest-declared tool, prepares user-facing confirmation, checks the opt-in setting at invocation, and turns the pure JSON into a VS Code `LanguageModelToolResult`. Entry-point wiring and package contributions are tested separately.

**Tech Stack:** TypeScript strict mode, VS Code public Language Model Tool API `^1.125.0`, reactive-vscode `^1.0.2`, Vitest `^4.1.10`, vscode-ext-gen `^1.6.0`.

## Global Constraints

- Add `annopulse.ai.enabled` as a boolean configuration with default `false`.
- Contribute and register exactly one tool named `annopulse_list_annotations`; use `toolReferenceName: "annopulseAnnotations"` and `when: "config.annopulse.ai.enabled"`.
- Add `onLanguageModelTool:annopulse_list_annotations` while preserving `onStartupFinished` activation.
- The tool returns only annotations already in `annotationStore`; it never starts a scan, opens a document, reads a file, invokes Git, invokes a language model, writes a workspace, shells out, reaches the network, accesses credentials, or sends telemetry.
- Input scope is `all`, `activeFile`, or `openEditors`; default is `all`. Limit default is `50`; only integers from `1` through `100` are accepted, all other values normalize to `50`.
- Resolved and ignored annotations are excluded unless their own boolean inclusion flag is true. Results retain deterministic source-location order and include at most the normalized limit.
- JSON output projects only id, URI, line, column, keyword, message, category, severity, rule id, normalized owner, boolean resolved/ignored flags, and source. It contains no document content, Git data, email, code snippets, or workspace enumeration.
- `prepareInvocation` is side-effect-free and describes the selected scope and maximum count; `invoke` must reject with an actionable error when `config.ai.enabled` is false.
- This tool works from the in-memory store in Web, Remote, Virtual, untrusted, and no-Git hosts. Agent availability is optional and must not affect the extension's existing functionality.
- Generate `src/meta.ts` and README only with `rtk pnpm generate:meta` after `package.json` edits.
- Prefix shell commands with `rtk`, except `pnpm typecheck`.
- Each task ends with format, lint, typecheck, and task-focused Vitest verification.

---

## File Structure

- `src/core/ai/list-annotations.ts`: pure input normalization, scope/state filtering, ordering, projection, and JSON serialization.
- `src/composables/use-annotation-language-model-tools.ts`: public VS Code tool registration, confirmation, configuration guard, and result adaptation.
- `src/index.ts`: activates the tool composable with all existing features.
- `package.json`: AI opt-in setting, Language Model Tool contribution, and activation event.
- `src/meta.ts` and `README.md`: generated configuration output.
- `tests/ai-list-annotations.test.ts`: pure selection and serialization contract.
- `tests/annotation-language-model-tools.test.ts`: VS Code adapter lifecycle and invocation behavior.
- `tests/index.test.ts`: entry-point activation wiring.
- `tests/package-metadata.test.ts`: manifest/configuration contribution contract.

### Task 1: Pure Annotation Snapshot Selector and Serializer

**Files:**

- Create: `src/core/ai/list-annotations.ts`
- Create: `tests/ai-list-annotations.test.ts`

**Interfaces:**

- Consumes: `AnnoPulseAnnotation`, `AnnoPulseCategory`, `AnnoPulseSeverity`, and `compareAnnoPulseAnnotations`.
- Produces: `AnnoPulseListAnnotationsInput`, `NormalizedAnnoPulseListAnnotationsInput`, `AnnoPulseListAnnotationsContext`, `AnnoPulseListAnnotationsResult`, `normalizeAnnoPulseListAnnotationsInput`, `listAnnoPulseAnnotations`, and `serializeAnnoPulseListAnnotations`.

- [ ] **Step 1: Write the failing pure-core tests**

Create `tests/ai-list-annotations.test.ts` with an annotation factory and input context:

```ts
const context = {
  activeUri: 'file:///workspace/a.ts',
  openUris: ['file:///workspace/a.ts', 'file:///workspace/b.ts'],
}
const annotations = [
  annotation('b-later', { column: 4, line: 2, uri: 'file:///workspace/b.ts' }),
  annotation('a-resolved', { resolved: true }),
  annotation('a-first', { owner: '  Ada  ' }),
  annotation('c-ignored', { ignored: true, uri: 'file:///workspace/c.ts' }),
]
```

Assert default behavior exactly:

```ts
expect(listAnnoPulseAnnotations(annotations, {}, context)).toStrictEqual({
  annotations: [
    expect.objectContaining({
      id: 'a-first',
      owner: 'Ada',
      resolved: false,
      ignored: false,
    }),
    expect.objectContaining({ id: 'b-later', resolved: false, ignored: false }),
  ],
  returned: 2,
  scope: 'all',
  total: 2,
  truncated: false,
})
```

Add tests asserting `activeFile` returns only `a-first`, `openEditors` returns `a-first` and `b-later`, and `{ includeResolved: true, includeIgnored: true }` returns all four in deterministic URI/line/column order. Add tests that `{ limit: 1 }` returns `returned: 1`, `total: 2`, and `truncated: true`; `{ limit: 0 }`, `{ limit: 101 }`, `{ limit: 1.5 }`, and `{ limit: '10' as never }` each normalize to 50; `{ limit: 100 }` is retained.

Parse serialized output and assert it is equal to the result object. Assert the first serialized annotation has no `range`, `keywordRange`, `messageRange`, `style`, `diagnostics`, Git, email, or document-text properties.

- [ ] **Step 2: Run the new test and confirm it fails**

Run:

```bash
rtk pnpm vitest tests/ai-list-annotations.test.ts
```

Expected: failure because `src/core/ai/list-annotations.ts` does not exist.

- [ ] **Step 3: Implement the pure contract**

Create `src/core/ai/list-annotations.ts` with these exported declarations:

```ts
export type AnnoPulseAnnotationToolScope = 'all' | 'activeFile' | 'openEditors'

export interface AnnoPulseListAnnotationsInput {
  readonly scope?: AnnoPulseAnnotationToolScope
  readonly limit?: number
  readonly includeResolved?: boolean
  readonly includeIgnored?: boolean
}

export interface AnnoPulseListAnnotationsContext {
  readonly activeUri: string | undefined
  readonly openUris: readonly string[]
}

export interface NormalizedAnnoPulseListAnnotationsInput {
  readonly scope: AnnoPulseAnnotationToolScope
  readonly limit: number
  readonly includeResolved: boolean
  readonly includeIgnored: boolean
}

export interface AnnoPulseListAnnotationsResult {
  /* exact projected shape from the spec */
}

export function normalizeAnnoPulseListAnnotationsInput(
  input: AnnoPulseListAnnotationsInput,
): NormalizedAnnoPulseListAnnotationsInput

export function listAnnoPulseAnnotations(
  annotations: readonly AnnoPulseAnnotation[],
  input: AnnoPulseListAnnotationsInput,
  context: AnnoPulseListAnnotationsContext,
): AnnoPulseListAnnotationsResult

export function serializeAnnoPulseListAnnotations(
  result: AnnoPulseListAnnotationsResult,
): string
```

Define `DEFAULT_ANNOPULSE_ANNOTATION_LIMIT = 50` and `MAX_ANNOPULSE_ANNOTATION_LIMIT = 100`. Normalize scope to `all` unless it equals one of the three literal values. Normalize inclusion flags with `=== true`. Normalize limit only when it is an integer within the inclusive range; otherwise use the default.

Filter resolved and ignored states before scope, use a `Set` for open URIs, then call `.toSorted(compareAnnoPulseAnnotations)`. Compute `total` before `.slice(0, limit)`. Project boolean flags with `annotation.resolved === true` and `annotation.ignored === true`; trim `annotation.owner` and omit it if empty. `serializeAnnoPulseListAnnotations` is exactly `JSON.stringify(result)`.

- [ ] **Step 4: Run focused verification and commit**

Run:

```bash
rtk pnpm vitest tests/ai-list-annotations.test.ts
rtk pnpm format:check
rtk pnpm lint
pnpm typecheck
rtk git add src/core/ai/list-annotations.ts tests/ai-list-annotations.test.ts
rtk git commit -m "feat: select bounded annotation snapshots"
```

Expected: pure tests prove filtering, scope, ordering, limit normalization/truncation, and safe JSON projection.

### Task 2: Read-Only Language Model Tool Adapter

**Files:**

- Create: `src/composables/use-annotation-language-model-tools.ts`
- Create: `tests/annotation-language-model-tools.test.ts`

**Interfaces:**

- Consumes: Task 1 pure functions, `annotationStore`, `config.ai.enabled`, `window`, `lm`, `LanguageModelTextPart`, `LanguageModelToolResult`, and `useDisposable`.
- Produces: `ANNOPULSE_LIST_ANNOTATIONS_TOOL_NAME` and `useAnnoPulseLanguageModelTools()`.

- [ ] **Step 1: Write adapter tests using only public VS Code contracts**

Create `tests/annotation-language-model-tools.test.ts`. Mock `lm.registerTool`, `LanguageModelTextPart`, `LanguageModelToolResult`, `window.activeTextEditor`, `window.visibleTextEditors`, `config.ai.enabled`, and `useDisposable`. Capture the registered tool as `LanguageModelTool<AnnoPulseListAnnotationsInput>`.

Add these tests:

```ts
it('registers the manifest tool and disposes its registration', () => {
  useAnnoPulseLanguageModelTools()
  expect(registerTool).toHaveBeenCalledWith(
    'annopulse_list_annotations',
    expect.objectContaining({
      invoke: expect.any(Function),
      prepareInvocation: expect.any(Function),
    }),
  )
  expect(useDisposable).toHaveBeenCalledWith(toolDisposable)
})

it('prepares a side-effect-free confirmation for the selected scope and limit', async () => {
  const prepared = await registeredTool.prepareInvocation!(
    { input: { limit: 2, scope: 'activeFile' } },
    cancellationToken,
  )
  expect(prepared).toMatchObject({
    invocationMessage:
      'Listing up to 2 AnnoPulse annotations from the active file.',
    confirmationMessages: {
      title: 'Share AnnoPulse annotations',
      message:
        'Share up to 2 already-indexed AnnoPulse annotations from the active file with the agent?',
    },
  })
})

it('rejects invocation while AI tools are disabled', async () => {
  await expect(
    registeredTool.invoke({ input: {} }, cancellationToken),
  ).rejects.toThrow(
    'AnnoPulse Language Model Tools are disabled. Enable annopulse.ai.enabled to use them.',
  )
})

it('returns a bounded all-scope store snapshot when enabled', async () => {
  configState.enabled = true
  annotationStore.setForUri('file:///workspace/a.ts', [annotation('a')])
  const result = await registeredTool.invoke(
    { input: { limit: 1 } },
    cancellationToken,
  )
  expect(textPart).toHaveBeenCalledWith(expect.stringContaining('"returned":1'))
  expect(result).toBeInstanceOf(LanguageModelToolResult)
})
```

Add active-file and open-editor invocations with different visible URI fixtures to prove adapter context reaches the Task 1 selector.

- [ ] **Step 2: Run the adapter test and confirm it fails**

Run:

```bash
rtk pnpm vitest tests/annotation-language-model-tools.test.ts
```

Expected: failure because the composable does not exist.

- [ ] **Step 3: Implement registration, confirmation, and adaptation**

Create `src/composables/use-annotation-language-model-tools.ts`:

```ts
export const ANNOPULSE_LIST_ANNOTATIONS_TOOL_NAME = 'annopulse_list_annotations'

export function useAnnoPulseLanguageModelTools() {
  const tool: LanguageModelTool<AnnoPulseListAnnotationsInput> = {
    prepareInvocation(options) {
      // normalize input through the same pure selection contract; do not access store or mutate state
    },
    invoke(options) {
      // check config, then read the current store and editor URI snapshot exactly once
    },
  }

  useDisposable(lm.registerTool(ANNOPULSE_LIST_ANNOTATIONS_TOOL_NAME, tool))
}
```

Create a small local `toolScopeLabel` mapping: `all -> 'all indexed files'`, `activeFile -> 'the active file'`, and `openEditors -> 'open editors'`. For `prepareInvocation`, use a pure exported `normalizeAnnoPulseListAnnotationsInput` from Task 1 to derive scope and limit without reading the store, and return the exact message shape in Step 1. It must not set confirmation text from annotation content.

In `invoke`, throw the exact disabled-setting error from Step 1 before reading `annotationStore`. When enabled, call `listAnnoPulseAnnotations(annotationStore.getAll(), options.input, { activeUri, openUris })`, serialize it, and return `new LanguageModelToolResult([new LanguageModelTextPart(serialized)])`. Use no `async` keyword unless awaiting is necessary.

- [ ] **Step 4: Verify adapter behavior and commit**

Run:

```bash
rtk pnpm vitest tests/annotation-language-model-tools.test.ts tests/ai-list-annotations.test.ts
rtk pnpm format:check
rtk pnpm lint
pnpm typecheck
rtk git add src/composables/use-annotation-language-model-tools.ts tests/annotation-language-model-tools.test.ts src/core/ai/list-annotations.ts tests/ai-list-annotations.test.ts
rtk git commit -m "feat: register read-only annotation Language Model Tool"
```

Expected: adapter tests prove registration, confirmation, disabled rejection, and all scope contexts without invoking a real model.

### Task 3: Manifest, Activation Wiring, and Release Verification

**Files:**

- Modify: `package.json`
- Modify: `src/meta.ts` through generation
- Modify: `README.md` through generation
- Modify: `src/index.ts`
- Modify: `tests/package-metadata.test.ts`
- Modify: `tests/index.test.ts`

**Interfaces:**

- Consumes: `useAnnoPulseLanguageModelTools` and `ANNOPULSE_LIST_ANNOTATIONS_TOOL_NAME`.
- Produces: manifest-declared/reachable tool and default-off generated configuration.

- [ ] **Step 1: Write failing package and entry-point tests**

In `tests/package-metadata.test.ts`, insert `annopulse.ai.enabled` after `annopulse.git.showMetadata` in the strict configuration list. Add a test that asserts its exact default/type/description and generated `ConfigKeyTypeMap` type. Add a manifest test asserting:

```ts
expect(pkg.activationEvents).toStrictEqual([
  'onLanguageModelTool:annopulse_list_annotations',
  'onStartupFinished',
])
expect(pkg.contributes.languageModelTools).toStrictEqual([
  {
    canBeReferencedInPrompt: true,
    displayName: 'List AnnoPulse Annotations',
    icon: '$(list-unordered)',
    inputSchema: {
      type: 'object',
      properties: {
        includeIgnored: { default: false, type: 'boolean' },
        includeResolved: { default: false, type: 'boolean' },
        limit: { default: 50, maximum: 100, minimum: 1, type: 'integer' },
        scope: {
          default: 'all',
          enum: ['all', 'activeFile', 'openEditors'],
          type: 'string',
        },
      },
    },
    modelDescription: expect.stringContaining('already-indexed'),
    name: 'annopulse_list_annotations',
    tags: ['annopulse', 'annotations', 'read-only'],
    toolReferenceName: 'annopulseAnnotations',
    userDescription: expect.stringContaining('already discovered'),
    when: 'config.annopulse.ai.enabled',
  },
])
```

Extend `tests/index.test.ts` with a mock for `useAnnoPulseLanguageModelTools` and assert it is called exactly once on activation after existing feature setup.

- [ ] **Step 2: Run package and entry tests and confirm failure**

Run:

```bash
rtk pnpm vitest tests/package-metadata.test.ts tests/index.test.ts
```

Expected: failure because no AI setting/contribution/activation event or entry-point invocation exists.

- [ ] **Step 3: Add manifest/configuration and generate docs**

Add `annopulse.ai.enabled` after `annopulse.git.showMetadata` with the exact description from the design. Add this exact `contributes.languageModelTools` array alongside the existing contributions:

```json
[
  {
    "name": "annopulse_list_annotations",
    "tags": ["annopulse", "annotations", "read-only"],
    "toolReferenceName": "annopulseAnnotations",
    "displayName": "List AnnoPulse Annotations",
    "modelDescription": "Returns a bounded JSON list of annotations already-indexed in AnnoPulse's in-memory store. Use it to inspect current annotation work; do not use it to search unscanned files or retrieve source code.",
    "userDescription": "List annotations already discovered by AnnoPulse.",
    "canBeReferencedInPrompt": true,
    "icon": "$(list-unordered)",
    "when": "config.annopulse.ai.enabled",
    "inputSchema": {
      "type": "object",
      "properties": {
        "scope": {
          "type": "string",
          "enum": ["all", "activeFile", "openEditors"],
          "default": "all"
        },
        "limit": {
          "type": "integer",
          "minimum": 1,
          "maximum": 100,
          "default": 50
        },
        "includeResolved": { "type": "boolean", "default": false },
        "includeIgnored": { "type": "boolean", "default": false }
      }
    }
  }
]
```

Set activation events to the formatter-normalized order `['onLanguageModelTool:annopulse_list_annotations', 'onStartupFinished']`. Generate and prove idempotence:

```bash
rtk pnpm generate:meta
rtk git add src/meta.ts README.md
rtk pnpm generate:meta
rtk git diff --exit-code -- src/meta.ts README.md
```

- [ ] **Step 4: Wire the extension activation**

After generation exposes `config.ai.enabled`, remove the temporary local `config.ai` type assertion from `src/composables/use-annotation-language-model-tools.ts` and read `config.ai.enabled` directly. Import `useAnnoPulseLanguageModelTools` in `src/index.ts` and call it after `useAnnoPulseCodeLens()`. Do not alter existing initialization order; add the new call as the final feature registration before logging.

- [ ] **Step 5: Run full verification and commit**

Run:

```bash
rtk pnpm vitest tests/ai-list-annotations.test.ts tests/annotation-language-model-tools.test.ts tests/package-metadata.test.ts tests/index.test.ts
rtk pnpm format:check
rtk pnpm lint
pnpm typecheck
rtk pnpm release:check
rtk pnpm build
rtk pnpm generate:meta
rtk git diff --exit-code -- src/meta.ts README.md
rtk git diff --check
rtk git add package.json src/meta.ts README.md src/index.ts tests/package-metadata.test.ts tests/index.test.ts
rtk git commit -m "feat: contribute annotation Language Model Tool"
```

Expected: package contribution, registration, generated docs, focused tool tests, desktop/Web integration, and clean generated diff all pass.

- [ ] **Step 6: Final review and integration**

Use `superpowers:requesting-code-review` for the completed branch. Fix Critical and Important findings, rerun covering tests, and request re-review. Merge only after a clean whole-branch review; remove the clean isolated worktree, then run `rtk pnpm release:check`, build, metadata generation, and generated-file checks on clean `main`.

## Plan Self-Review

### Spec coverage

- Current-store-only, bounded deterministic selection and safe projection: Task 1.
- User confirmation, setting guard, public registration, and no-model behavior: Task 2.
- Default-off setting, manifest contribution/input schema/activation, generated documentation, and entry wiring: Task 3.
- Platform safety and full release verification: Global Constraints and Task 3.

### Placeholder scan

The plan has no unresolved design markers. Every task identifies exact files, APIs, literals, test cases, verification commands, and commit boundaries.

### Type consistency

Task 1 exports the input/context/result types and normalizer consumed by Task 2. Task 2 exports the composable consumed by Task 3. The manifest input schema in Task 3 matches Task 1's literals, defaults, and limits exactly.
