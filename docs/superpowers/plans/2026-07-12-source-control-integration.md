# Source Control Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in, read-only AnnoPulse Source Control provider that lists changed Git files containing current annotations.

**Architecture:** Keep URI grouping and tooltip construction in a pure core module so its deterministic semantics are unit-tested without VS Code. A composable owns the public VS Code SCM objects, mirrors annotation-store and changed-URI updates into resource states, and uses generation counters to discard late asynchronous Git results. The extension entry point creates one Git adapter and injects it into Explorer, Hover, and SCM integration.

**Tech Stack:** TypeScript strict mode, VS Code public SCM API `^1.125.0`, reactive-vscode `^1.0.2`, Vitest `^4.1.10`, vscode-ext-gen `^1.6.0`.

## Global Constraints

- Add `annopulse.scm.enabled` as a boolean configuration, defaulting to `false`.
- Create only one independent `AnnoPulse` Source Control provider with one `Changed Annotations` resource group while enabled.
- List exactly one resource for each URI present in both the Git changed-URI snapshot and the annotation store, including resolved and ignored annotations.
- Resource command is `vscode.open` with its `Uri` as the only argument; resources use context value `annopulseChangedResource` and the `comment-discussion` icon.
- The implementation uses only VS Code public APIs and the existing built-in Git extension adapter: no Git writes, shell commands, Node runtime file/process APIs, network calls, credential access, document writes, or remote issue creation.
- In Web, untrusted, virtual, absent-Git, or failing-Git situations, expose an empty provider without throwing.
- Dispose the Source Control provider, group, Git subscription, and pending generation whenever the setting becomes disabled and at extension deactivation.
- Keep `src/meta.ts` and generated `README.md` authoritative: after changing `package.json`, run `rtk pnpm generate:meta` and prove no subsequent generated-file diff.
- Prefix shell commands with `rtk`, except `pnpm typecheck`.
- Each task ends with `rtk pnpm format:check`, `rtk pnpm lint`, `pnpm typecheck`, and its focused Vitest command.

---

## File Structure

- `package.json`: declares the opt-in SCM setting and its user-facing generated documentation.
- `src/meta.ts`: generated typed configuration metadata; never hand-edited.
- `README.md`: generated configuration reference, including read-only changed-file semantics.
- `src/core/source-control/resources.ts`: VS Code-free grouping, category summary, sort order, and tooltip formatting.
- `src/composables/use-annotation-git.ts`: exports the stable Git adapter interface used by consumers.
- `src/composables/use-annotation-explorer.ts`: accepts the shared Git adapter instead of constructing a second one.
- `src/composables/use-annotation-source-control.ts`: owns `scm.createSourceControl`, `Changed Annotations`, subscriptions, resource states, and lifecycle guards.
- `src/index.ts`: creates the shared Git adapter once and passes it to Explorer, Hover, and SCM.
- `tests/package-metadata.test.ts`: asserts configuration schema and generated typing.
- `tests/source-control-resources.test.ts`: unit-tests pure resource descriptors.
- `tests/annotation-source-control.test.ts`: mocks public VS Code/adapter boundaries and tests lifecycle, refresh, and race behavior.
- `tests/annotation-explorer.test.ts`: updates Explorer setup to receive the adapter dependency explicitly.

## Task 1: SCM Configuration and Pure Resource Descriptors

**Files:**

- Create: `src/core/source-control/resources.ts`
- Create: `tests/source-control-resources.test.ts`
- Modify: `package.json`
- Modify: `src/meta.ts` via `rtk pnpm generate:meta`
- Modify: `README.md` via `rtk pnpm generate:meta`
- Modify: `tests/package-metadata.test.ts`

**Interfaces:**

- Consumes: `AnnoPulseAnnotation` from `src/types/annotation.ts`.
- Produces: `AnnoPulseSourceControlResourceDescriptor`, `createAnnoPulseSourceControlResources(changedUris, annotations)`, and generated `config.scm.enabled: boolean`.

- [ ] **Step 1: Write the failing descriptor and metadata tests**

Create `tests/source-control-resources.test.ts` with representative annotations that include two records for `file:///workspace/a.ts`, one resolved record for `file:///workspace/b.ts`, and one unchanged record for `file:///workspace/c.ts`. Assert the pure boundary exactly:

```ts
expect(
  createAnnoPulseSourceControlResources(
    new Set(['file:///workspace/b.ts', 'file:///workspace/a.ts']),
    annotations,
  ),
).toStrictEqual([
  {
    annotationCount: 2,
    categories: ['BUG', 'TODO'],
    tooltip: '2 AnnoPulse annotations (BUG, TODO)',
    uri: 'file:///workspace/a.ts',
  },
  {
    annotationCount: 1,
    categories: ['NOTE'],
    tooltip: '1 AnnoPulse annotation (NOTE)',
    uri: 'file:///workspace/b.ts',
  },
])

expect(
  createAnnoPulseSourceControlResources(new Set(), annotations),
).toStrictEqual([])
expect(
  createAnnoPulseSourceControlResources(
    new Set(['file:///workspace/c.ts']),
    [],
  ),
).toStrictEqual([])
```

In `tests/package-metadata.test.ts`, insert `'annopulse.scm.enabled'` after `'annopulse.git.staleDays'` in the exact configuration-key expectation. Add:

```ts
it('declares an opt-in read-only Source Control setting', () => {
  const sourceControl = pkg.contributes.configuration.properties[
    'annopulse.scm.enabled'
  ] as { default?: unknown; description?: unknown; type?: unknown }

  expect(sourceControl).toMatchObject({ default: false, type: 'boolean' })
  expect(sourceControl.description).toContain('read-only')
  expectTypeOf<false>().toMatchTypeOf<
    ConfigKeyTypeMap['annopulse.scm.enabled']
  >()
})
```

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run:

```bash
rtk pnpm vitest tests/source-control-resources.test.ts tests/package-metadata.test.ts
```

Expected: failure because the resource module and generated `annopulse.scm.enabled` type do not exist.

- [ ] **Step 3: Add the schema with generated documentation**

In `package.json`, immediately after `annopulse.git.staleDays`, add this complete property so the generated README retains the behavior:

```json
"annopulse.scm.enabled": {
  "type": "boolean",
  "default": false,
  "description": "Show a read-only AnnoPulse Source Control provider for changed Git files containing annotations. It never stages, unstages, commits, or modifies Git; unavailable Git data, virtual filesystems, and untrusted workspaces produce an empty list."
}
```

Generate metadata and verify its idempotence:

```bash
rtk pnpm generate:meta
rtk git add src/meta.ts README.md
rtk pnpm generate:meta
rtk git diff --exit-code -- src/meta.ts README.md
```

The first generation may update both generated files. Staging those generated outputs and generating a second time proves generation is idempotent because the final scoped diff must be empty. Confirm `src/meta.ts` declares the `scm: { enabled: boolean }` nested shape and the README configuration table contains the read-only wording.

- [ ] **Step 4: Implement the VS Code-free descriptor module**

Create `src/core/source-control/resources.ts`:

```ts
import type { AnnoPulseAnnotation } from '../../types/annotation'

export interface AnnoPulseSourceControlResourceDescriptor {
  readonly annotationCount: number
  readonly categories: readonly string[]
  readonly tooltip: string
  readonly uri: string
}

function categorySummary(
  annotations: readonly AnnoPulseAnnotation[],
): string[] {
  return [
    ...new Set(
      annotations.map(annotation => annotation.category.toUpperCase()),
    ),
  ].sort((left, right) => left.localeCompare(right))
}

export function createAnnoPulseSourceControlResources(
  changedUris: ReadonlySet<string>,
  annotations: readonly AnnoPulseAnnotation[],
): readonly AnnoPulseSourceControlResourceDescriptor[] {
  const annotationsByUri = new Map<string, AnnoPulseAnnotation[]>()

  for (const annotation of annotations) {
    if (!changedUris.has(annotation.uri)) continue
    annotationsByUri.set(annotation.uri, [
      ...(annotationsByUri.get(annotation.uri) ?? []),
      annotation,
    ])
  }

  return [...annotationsByUri]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([uri, uriAnnotations]) => {
      const annotationCount = uriAnnotations.length
      const categories = categorySummary(uriAnnotations)
      return {
        annotationCount,
        categories,
        tooltip: `${annotationCount} AnnoPulse annotation${annotationCount === 1 ? '' : 's'} (${categories.join(', ')})`,
        uri,
      }
    })
}
```

Do not filter `resolved` or `ignored`: resource membership is intentionally the current store intersected with changed URIs.

- [ ] **Step 5: Run focused and task-wide verification**

Run:

```bash
rtk pnpm vitest tests/source-control-resources.test.ts tests/package-metadata.test.ts
rtk pnpm format:check
rtk pnpm lint
pnpm typecheck
```

Expected: all commands exit 0; lint may retain documented pre-existing warnings but reports no errors.

- [ ] **Step 6: Commit the independent foundation**

Run:

```bash
rtk git add package.json src/meta.ts README.md src/core/source-control/resources.ts tests/source-control-resources.test.ts tests/package-metadata.test.ts
rtk git commit -m "feat: add Source Control resource descriptors"
```

Expected: one focused commit containing the opt-in setting, generated metadata, and pure descriptor behavior.

### Task 2: Source Control Composable and Async Lifecycle

**Files:**

- Create: `src/composables/use-annotation-source-control.ts`
- Create: `tests/annotation-source-control.test.ts`
- Modify: `src/composables/use-annotation-git.ts`

**Interfaces:**

- Consumes: `config.scm.enabled`, `annotationStore`, `createAnnoPulseSourceControlResources`, `useDisposable`, `scm`, `Uri`, `ThemeIcon`, and the Git adapter.
- Produces: `AnnoPulseGitAdapter`, `useAnnoPulseSourceControl(git: Pick<AnnoPulseGitAdapter, 'getChangedUris' | 'subscribeToChangedUris'>)`, with an optional `dispose()` returned for direct lifecycle tests.

- [ ] **Step 1: Write composable tests with only public VS Code contracts**

Create `tests/annotation-source-control.test.ts`. Hoist mocks for `scm.createSourceControl`, `sourceControl.createResourceGroup`, `workspace.onDidChangeConfiguration`, `useDisposable`, the mutable `config.scm.enabled`, a Git adapter snapshot promise, and its subscription callback. Use a `resourceGroup` object with assignable `resourceStates`, a `sourceControl` object with assignable `count`, and disposables tracked by spies.

Add these tests:

```ts
it('does not create a Source Control provider while disabled', () => {
  useAnnoPulseSourceControl(git)
  expect(createSourceControl).not.toHaveBeenCalled()
})

it('lists sorted changed annotation files with standard open commands', async () => {
  configState.enabled = true
  getChangedUris.mockResolvedValue(new Set(['file:///b.ts', 'file:///a.ts']))
  annotationStore.setForUri('file:///a.ts', [
    annotation('a-1'),
    annotation('a-2'),
  ])
  annotationStore.setForUri('file:///b.ts', [
    annotation('b-1', { resolved: true }),
  ])

  useAnnoPulseSourceControl(git)
  await flushPromises()

  expect(createSourceControl).toHaveBeenCalledWith('annopulse', 'AnnoPulse')
  expect(createResourceGroup).toHaveBeenCalledWith(
    'changedAnnotations',
    'Changed Annotations',
  )
  expect(sourceControl.count).toBe(2)
  expect(resourceGroup.resourceStates).toMatchObject([
    {
      command: {
        arguments: [expect.objectContaining({ value: 'file:///a.ts' })],
        command: 'vscode.open',
        title: 'Open AnnoPulse File',
      },
      contextValue: 'annopulseChangedResource',
      decorations: {
        icon: expect.objectContaining({ id: 'comment-discussion' }),
        tooltip: '2 AnnoPulse annotations (TODO)',
      },
    },
    { resourceUri: expect.objectContaining({ value: 'file:///b.ts' }) },
  ])
})

it('refreshes from annotation and Git state changes', async () => {
  configState.enabled = true
  getChangedUris.mockResolvedValueOnce(new Set(['file:///a.ts']))
  useAnnoPulseSourceControl(git)
  await flushPromises()

  expect(sourceControl.count).toBe(0)
  annotationStore.setForUri('file:///a.ts', [annotation('a-1')])
  expect(sourceControl.count).toBe(1)
  expect(resourceGroup.resourceStates).toHaveLength(1)

  getChangedUris.mockResolvedValueOnce(new Set(['file:///b.ts']))
  annotationStore.setForUri('file:///b.ts', [annotation('b-1')])
  gitChangedUrisListeners[0]!()
  await flushPromises()

  expect(sourceControl.count).toBe(1)
  expect(resourceGroup.resourceStates).toMatchObject([
    { resourceUri: expect.objectContaining({ value: 'file:///b.ts' }) },
  ])
})

it('empties resources when Git is unavailable or rejects', async () => {
  configState.enabled = true
  getChangedUris.mockResolvedValueOnce(new Set(['file:///a.ts']))
  annotationStore.setForUri('file:///a.ts', [annotation('a-1')])
  useAnnoPulseSourceControl(git)
  await flushPromises()

  expect(sourceControl.count).toBe(1)
  getChangedUris.mockRejectedValueOnce(new Error('Git unavailable'))
  gitChangedUrisListeners[0]!()
  await flushPromises()

  expect(sourceControl.count).toBe(0)
  expect(resourceGroup.resourceStates).toStrictEqual([])
})

it('disposes provider, group, and Git subscription when disabled', async () => {
  configState.enabled = true
  useAnnoPulseSourceControl(git)
  await flushPromises()
  const gitSubscription = gitChangedUrisSubscriptions[0]!

  configState.enabled = false
  configurationListeners[0]!({
    affectsConfiguration: (key: string) => key === 'annopulse.scm.enabled',
  })

  expect(gitSubscription.dispose).toHaveBeenCalledTimes(1)
  expect(resourceGroup.dispose).toHaveBeenCalledTimes(1)
  expect(sourceControl.dispose).toHaveBeenCalledTimes(1)
})

it('disposes a late Git subscription and ignores a late snapshot after disable', async () => {
  const changedUris = deferred<ReadonlySet<string>>()
  const subscription = deferred<{ dispose: () => void }>()
  const lateSubscription = { dispose: vi.fn<() => void>() }
  configState.enabled = true
  getChangedUris.mockReturnValueOnce(changedUris.promise)
  subscribeToChangedUris.mockReturnValueOnce(subscription.promise)
  useAnnoPulseSourceControl(git)

  configState.enabled = false
  configurationListeners[0]!({
    affectsConfiguration: (key: string) => key === 'annopulse.scm.enabled',
  })
  changedUris.resolve(new Set(['file:///a.ts']))
  subscription.resolve(lateSubscription)
  await flushPromises()

  expect(lateSubscription.dispose).toHaveBeenCalledTimes(1)
  expect(resourceGroup.resourceStates).toStrictEqual([])
})
```

Define this `deferred<T>()` helper at the test file top for the late-result test:

```ts
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, reject, resolve }
}
```

Each test asserts the terminal count and resource array, not only mock call counts.

- [ ] **Step 2: Run the source-control test and confirm it fails**

Run:

```bash
rtk pnpm vitest tests/annotation-source-control.test.ts
```

Expected: failure because `useAnnoPulseSourceControl` and exported adapter type do not exist.

- [ ] **Step 3: Export the Git adapter contract**

At the top-level of `src/composables/use-annotation-git.ts`, add:

```ts
export interface AnnoPulseGitAdapter {
  getChangedUris: () => Promise<ReadonlySet<string>>
  getMetadata: (
    document: TextDocument,
    annotation: AnnoPulseAnnotation,
  ) => Promise<AnnoPulseGitMetadata | undefined>
  getMetadataForAnnotations: (
    document: TextDocument,
    annotations: readonly AnnoPulseAnnotation[],
  ) => Promise<ReadonlyMap<string, AnnoPulseGitMetadata>>
  subscribeToChangedUris: (listener: () => void) => Promise<Disposable>
}
```

Declare `export function useAnnoPulseGit(): AnnoPulseGitAdapter` and keep its existing return object unchanged. This makes shared injection explicit without expanding the public behavior.

- [ ] **Step 4: Implement lifecycle-safe SCM integration**

Create `src/composables/use-annotation-source-control.ts` using this complete state model:

```ts
import { useDisposable } from 'reactive-vscode'
import {
  ThemeIcon,
  Uri,
  scm,
  workspace,
  type Disposable,
  type SourceControl,
  type SourceControlResourceGroup,
  type SourceControlResourceState,
} from 'vscode'
import { config } from '../config'
import { createAnnoPulseSourceControlResources } from '../core/source-control/resources'
import { annotationStore } from '../core/store/annotation-store'
import type { AnnoPulseGitAdapter } from './use-annotation-git'

const SOURCE_CONTROL_ID = 'annopulse'
const SOURCE_CONTROL_LABEL = 'AnnoPulse'
const RESOURCE_GROUP_ID = 'changedAnnotations'
const RESOURCE_GROUP_LABEL = 'Changed Annotations'

export function useAnnoPulseSourceControl(
  git: Pick<AnnoPulseGitAdapter, 'getChangedUris' | 'subscribeToChangedUris'>,
) {
  let changedUris = new Set<string>()
  let generation = 0
  let gitSubscription: Disposable | undefined
  let group: SourceControlResourceGroup | undefined
  let sourceControl: SourceControl | undefined

  function render() {
    if (!sourceControl || !group) return
    const states: SourceControlResourceState[] =
      createAnnoPulseSourceControlResources(
        changedUris,
        annotationStore.getAll(),
      ).map(descriptor => {
        const resourceUri = Uri.parse(descriptor.uri)
        return {
          command: {
            arguments: [resourceUri],
            command: 'vscode.open',
            title: 'Open AnnoPulse File',
          },
          contextValue: 'annopulseChangedResource',
          decorations: {
            icon: new ThemeIcon('comment-discussion'),
            tooltip: descriptor.tooltip,
          },
          resourceUri,
        }
      })
    group.resourceStates = states
    sourceControl.count = states.length
  }

  function disable() {
    generation += 1
    changedUris = new Set()
    gitSubscription?.dispose()
    gitSubscription = undefined
    group?.dispose()
    group = undefined
    sourceControl?.dispose()
    sourceControl = undefined
  }

  function refreshChangedUris() {
    if (!config.scm.enabled || !sourceControl) return
    const request = generation
    void git.getChangedUris().then(
      uris => {
        if (request !== generation || !config.scm.enabled) return
        changedUris = new Set(uris)
        render()
      },
      () => {
        if (request !== generation || !config.scm.enabled) return
        changedUris = new Set()
        render()
      },
    )
  }

  function enable() {
    if (sourceControl) return
    sourceControl = scm.createSourceControl(
      SOURCE_CONTROL_ID,
      SOURCE_CONTROL_LABEL,
    )
    group = sourceControl.createResourceGroup(
      RESOURCE_GROUP_ID,
      RESOURCE_GROUP_LABEL,
    )
    const request = generation
    void git.subscribeToChangedUris(refreshChangedUris).then(
      subscription => {
        if (request !== generation || !config.scm.enabled) {
          subscription.dispose()
        } else {
          gitSubscription = subscription
        }
      },
      () => undefined,
    )
    refreshChangedUris()
  }

  function synchronize() {
    if (config.scm.enabled) enable()
    else disable()
  }

  useDisposable({ dispose: annotationStore.subscribe(render) })
  useDisposable(
    workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('annopulse.scm.enabled')) synchronize()
    }),
  )
  useDisposable({ dispose: disable })
  synchronize()
  return { dispose: disable }
}
```

Before committing, eliminate the duplicate `disable()` calls caused by multiple lifecycle hooks by adding `if (!sourceControl && !group && !gitSubscription) return` at the start of `disable()`, while still incrementing `generation` when active state exists. Keep the `render()` call after every accepted snapshot and store update.

- [ ] **Step 5: Run focused and task-wide verification**

Run:

```bash
rtk pnpm vitest tests/annotation-source-control.test.ts tests/annotation-git.test.ts
rtk pnpm format:check
rtk pnpm lint
pnpm typecheck
```

Expected: Source Control tests prove disabled default, deterministic state, refresh, error-empty behavior, disposal, and late-result protection; existing Git tests remain green.

- [ ] **Step 6: Commit the composable**

Run:

```bash
rtk git add src/composables/use-annotation-git.ts src/composables/use-annotation-source-control.ts tests/annotation-source-control.test.ts
rtk git commit -m "feat: add read-only Source Control provider"
```

Expected: one focused commit with no package metadata change.

### Task 3: Shared Git Wiring, Documentation Check, and Release Verification

**Files:**

- Modify: `src/composables/use-annotation-explorer.ts`
- Modify: `src/index.ts`
- Modify: `tests/annotation-explorer.test.ts`

**Interfaces:**

- Consumes: `AnnoPulseGitAdapter`, `useAnnoPulseSourceControl`, `useAnnoPulseExplorer`, `useAnnoPulseHover`.
- Produces: exactly one `useAnnoPulseGit()` invocation during extension activation, passed to all Git-aware consumers.

- [ ] **Step 1: Write the failing dependency-injection tests**

In `tests/annotation-explorer.test.ts`, retain the existing mocked Git adapter but call `useAnnoPulseExplorer(git)` in setup. Add a direct test that passes a custom adapter whose `getChangedUris` and `subscribeToChangedUris` spies are asserted after selecting `changedFiles`; this proves Explorer uses its injected adapter rather than importing and calling `useAnnoPulseGit()` itself.

Create a narrow `tests/index.test.ts` only if the existing extension-entry testing setup can load `defineExtension`; otherwise add the following assertion to the desktop smoke test after activation:

```ts
expect(useAnnoPulseGit).toHaveBeenCalledTimes(1)
expect(useAnnoPulseExplorer).toHaveBeenCalledWith(git)
expect(useAnnoPulseHover).toHaveBeenCalledWith(git.getMetadata)
expect(useAnnoPulseSourceControl).toHaveBeenCalledWith(git)
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
rtk pnpm vitest tests/annotation-explorer.test.ts
```

Expected: failure because Explorer currently obtains a new adapter internally.

- [ ] **Step 3: Inject the shared adapter**

Change the Explorer signature and remove its internal factory call:

```ts
import type { AnnoPulseGitAdapter } from './use-annotation-git'

export function useAnnoPulseExplorer(
  git: Pick<
    AnnoPulseGitAdapter,
    'getChangedUris' | 'getMetadataForAnnotations' | 'subscribeToChangedUris'
  >,
) {
  const { getChangedUris, getMetadataForAnnotations, subscribeToChangedUris } =
    git
  // Preserve the existing provider and refresh behavior below this point.
}
```

In `src/index.ts`, create the adapter once after commands and diagnostics, then wire all consumers:

```ts
const annotationGit = useAnnoPulseGit()
useAnnoPulseExplorer(annotationGit)
useWorkspaceScan()
const annotationHighlight = useAnnoPulseHighlight()
useAnnoPulseNotebook(annotationHighlight.scanTextDocument)
useAnnoPulseHover(annotationGit.getMetadata)
useAnnoPulseSourceControl(annotationGit)
useAnnoPulseCodeLens()
```

Add the `useAnnoPulseSourceControl` import. Do not change feature initialization order beyond replacing Explorer's internal adapter and adding SCM after Hover.

- [ ] **Step 4: Confirm generated docs and behavior remain exact**

Run:

```bash
rtk pnpm generate:meta
rtk git diff --exit-code -- src/meta.ts README.md
rtk rg -n 'annopulse.scm.enabled|read-only AnnoPulse Source Control|Changed Annotations' package.json README.md src
```

Expected: second generation produces no change, and the grep finds schema/documentation plus the fixed resource-group label.

- [ ] **Step 5: Run release-scope verification**

Run:

```bash
rtk pnpm vitest tests/annotation-explorer.test.ts tests/annotation-source-control.test.ts tests/source-control-resources.test.ts tests/package-metadata.test.ts
rtk pnpm format:check
rtk pnpm lint
pnpm typecheck
rtk pnpm test:unit
rtk pnpm test:e2e
rtk pnpm test:web
rtk pnpm build
rtk pnpm generate:meta
rtk git diff --exit-code -- src/meta.ts README.md
```

Expected: all commands exit 0. While the isolated worktree exists, the root Vitest discovery may include duplicate test files; record the passing total and rerun unit tests on clean `main` after worktree removal before final handoff.

- [ ] **Step 6: Commit and request final review**

Run:

```bash
rtk git add src/index.ts src/composables/use-annotation-explorer.ts tests/annotation-explorer.test.ts
rtk git commit -m "feat: wire Source Control integration"
```

Then use `superpowers:requesting-code-review` for the completed branch before integration. Address every blocker, repeat relevant verification, merge to `main` only after the review is clean, remove the clean isolated worktree, and run the release-scope checks once more on `main`.

## Plan Self-Review

### Spec coverage

- `annopulse.scm.enabled` default false: Task 1 schema/type test.
- Separate AnnoPulse provider and Changed Annotations group: Task 2 composable tests and implementation.
- One resource per changed URI with annotations, standard open command, context value, icon, sorted states, tooltip, and count: Tasks 1 and 2.
- Store/Git refresh, failures/untrusted empty state, configuration/deactivation disposal, and late async guards: Task 2.
- Shared Git construction for Explorer/Hover/SCM: Task 3.
- No Git writes or non-public API use: Global Constraints plus Task 2's public API-only module.
- Generated documentation and release verification: Tasks 1 and 3.

### Placeholder scan

The plan contains no unresolved implementation markers or references to work that must be designed later. Task 2's test outline mandates executable deferred-promise setup and terminal assertions for each lifecycle case.

### Type consistency

`AnnoPulseGitAdapter` is defined in Task 2, its minimal `Pick` forms are consumed by Task 2 and Task 3, and `useAnnoPulseGit()` returns the full interface. Descriptor fields (`uri`, `annotationCount`, `categories`, `tooltip`) are defined in Task 1 and used without renaming in Task 2.
