# Richer Hover and Explorer Metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Present owner, lifecycle state, and optional trusted Git attribution consistently in Code Beacon Hovers and Explorer items without changing annotation membership or triggering Git work by default.

**Architecture:** Add a pure Git-presentation module for deterministic annotation state, owner normalization, relative age, and plain Explorer strings. The Hover imports the pure values and independently escapes all interpolated Markdown. The Explorer exposes its existing metadata index to its Tree provider and hydrates Git metadata only when stale filtering or an explicit opt-in setting requires it.

**Tech Stack:** TypeScript strict mode, VS Code public API `^1.125.0`, reactive-vscode `^1.0.2`, Vitest `^4.1.10`, vscode-ext-gen `^1.6.0`.

## Global Constraints

- Add `code-beacon.git.showMetadata` as a boolean configuration with default `false`.
- Default Explorer operation must not request extra Git blame metadata; hydration runs only in a trusted workspace when `config.explorer.onlyStale` or `config.git.showMetadata` is true.
- Keep existing annotation membership, filtering, sort order, reveal command, context values, and resolved/ignored behavior unchanged.
- Use the existing public VS Code Git extension adapter and its cache only. Do not add Git commands, Git writes, Node runtime filesystem/process APIs, network calls, credentials, document writes, or AI calls.
- In Web, Remote, Virtual Workspace, untrusted, missing-Git, and failing-Git scenarios, Hovers and Explorer remain functional without Git fields.
- Tree descriptions and Tooltips are plain text; all dynamic Hover Markdown fields are escaped.
- Whitespace-only owners are omitted from compact display and use `Unassigned` in the plain Tooltip.
- A valid future Git date formats as `today`; invalid or absent date formats no age.
- Generate `src/meta.ts` and README only through `rtk pnpm generate:meta` after editing `package.json`.
- Prefix shell commands with `rtk`, except `pnpm typecheck`.
- Each task ends with `rtk pnpm format:check`, `rtk pnpm lint`, `pnpm typecheck`, and task-focused Vitest commands.

---

## File Structure

- `src/core/git/presentation.ts`: pure owner, state, relative-age, and plain Explorer string helpers.
- `src/core/hover/format.ts`: Markdown-safe Hover composition using pure presentation values.
- `src/core/explorer/tree-data-provider.ts`: obtains metadata for each leaf and applies pure descriptions/tooltips.
- `src/composables/use-beacon-explorer.ts`: exposes the existing metadata index to the Tree provider and gates batch hydration on the new setting.
- `package.json`: declares the opt-in setting and generated documentation text.
- `src/meta.ts` and `README.md`: generated configuration output.
- `tests/git-presentation.test.ts`: deterministic pure presentation coverage.
- `tests/hover-format.test.ts`: Hover fields and Markdown-escaping coverage.
- `tests/tree-data-provider.test.ts`: Tree description/Tooltip coverage.
- `tests/beacon-explorer.test.ts`: metadata-hydration policy and refresh coverage.
- `tests/package-metadata.test.ts`: schema/default/generated config type coverage.

### Task 1: Pure Metadata Presentation and Safe Hover Content

**Files:**

- Create: `src/core/git/presentation.ts`
- Create: `tests/git-presentation.test.ts`
- Modify: `src/core/hover/format.ts`
- Modify: `tests/hover-format.test.ts`

**Interfaces:**

- Consumes: `BeaconAnnotation` from `src/types/annotation.ts` and optional `BeaconGitMetadata` from `src/core/git/blame.ts`.
- Produces: `beaconDisplayOwner`, `beaconDisplayState`, `formatBeaconGitAge`, `formatBeaconExplorerDescription`, and `formatBeaconExplorerTooltip` for later Tree use.

- [ ] **Step 1: Write deterministic pure presentation tests**

Create `tests/git-presentation.test.ts` with the repository's standard annotation factory. Add these exact assertions using `const now = new Date('2026-07-12T12:00:00.000Z')`:

```ts
expect(beaconDisplayOwner(annotation({ owner: '  Ada  ' }))).toBe('Ada')
expect(beaconDisplayOwner(annotation({ owner: '   ' }))).toBeUndefined()
expect(beaconDisplayState(annotation())).toBe('active')
expect(beaconDisplayState(annotation({ resolved: true }))).toBe('resolved')
expect(beaconDisplayState(annotation({ ignored: true }))).toBe('ignored')
expect(beaconDisplayState(annotation({ ignored: true, resolved: true }))).toBe(
  'resolved, ignored',
)

expect(
  formatBeaconGitAge(
    { ...metadata, commitDate: '2026-07-11T12:00:00.000Z' },
    now,
  ),
).toBe('1 day ago')
expect(
  formatBeaconGitAge(
    { ...metadata, commitDate: '2026-07-09T12:00:00.000Z' },
    now,
  ),
).toBe('3 days ago')
expect(
  formatBeaconGitAge({ ...metadata, commitDate: 'not-a-date' }, now),
).toBeUndefined()
expect(
  formatBeaconGitAge(
    { ...metadata, commitDate: '2026-07-13T12:00:00.000Z' },
    now,
  ),
).toBe('today')
```

For an annotation at line 1/column 3 with owner `Ada`, resolved state, and metadata for `Grace Hopper` from yesterday, assert:

```ts
expect(formatBeaconExplorerDescription(annotation, metadata, now)).toBe(
  '2:4 • @Ada • Grace Hopper • 1 day ago • resolved',
)
expect(formatBeaconExplorerTooltip(annotation, metadata, now)).toContain(
  'Owner: @Ada',
)
expect(formatBeaconExplorerTooltip(annotation, metadata, now)).toContain(
  'State: resolved',
)
expect(formatBeaconExplorerTooltip(annotation, metadata, now)).toContain(
  'Commit: a1b2c3d',
)
```

Add an ownerless no-metadata Tooltip assertion for `Owner: Unassigned`, `State: active`, and no `Git:` line.

- [ ] **Step 2: Run the pure test and confirm it fails**

Run:

```bash
rtk pnpm vitest tests/git-presentation.test.ts
```

Expected: failure because `src/core/git/presentation.ts` does not exist.

- [ ] **Step 3: Add the pure presentation module**

Create `src/core/git/presentation.ts` with these public signatures:

```ts
export function beaconDisplayOwner(
  annotation: BeaconAnnotation,
): string | undefined

export function beaconDisplayState(annotation: BeaconAnnotation): string

export function formatBeaconGitAge(
  metadata: BeaconGitMetadata | undefined,
  now: Date,
): string | undefined

export function formatBeaconExplorerDescription(
  annotation: BeaconAnnotation,
  metadata: BeaconGitMetadata | undefined,
  now: Date,
): string

export function formatBeaconExplorerTooltip(
  annotation: BeaconAnnotation,
  metadata: BeaconGitMetadata | undefined,
  now: Date,
): string
```

Implement the helpers with no VS Code import. `beaconDisplayOwner` must call `annotation.owner?.trim()` and return `undefined` for the empty result. `beaconDisplayState` must return the four exact strings asserted in Step 1. `formatBeaconGitAge` must parse `metadata?.commitDate`, return `undefined` for non-finite values, return `today` for a non-positive day difference, and otherwise return singular/plural day strings using `Math.floor((now.getTime() - commitTime) / 86_400_000)`.

`formatBeaconExplorerDescription` must build `[location, owner, author, age, resolved, ignored]`, omitting absent owner/author/age and including resolved/ignored as separate segments. `formatBeaconExplorerTooltip` must build newline-separated plain text in this exact order: title, `Location`, `Owner`, `State`, then (only when metadata exists) a `Git:` section followed by `Author`, optional `Email`, `Date`, optional `Age`, `Commit` with `hash.slice(0, 7)`, and `Summary`.

- [ ] **Step 4: Extend Hover formatter tests before changing production code**

In `tests/hover-format.test.ts`, add an annotation with `owner: 'Ada'`, `resolved: true`, `ignored: true`, and metadata with `authorEmail: 'ada@example.test'` and a commit one day before a fixed `now`. Change the formatter call to pass `now` and assert:

```ts
expect(markdown).toContain('- Owner: @Ada')
expect(markdown).toContain('- State: resolved, ignored')
expect(markdown).toContain('- Email: ada@example.test')
expect(markdown).toContain('- Age: `1 day ago`')
```

Add a security regression with a message, owner, author, and summary containing `# heading`, `[link](https://example.test)`, `` `code` ``, and `**bold**`. Assert every dynamic Markdown field is escaped (for example `\# heading`, `\[link\]`, `\`code\``, and `\*\*bold\*\*`) and that the formatter has no unescaped injected heading or link syntax.

- [ ] **Step 5: Implement safe Hover composition**

Change `formatBeaconHoverMarkdown` to accept an optional third `now: Date = new Date()` parameter. Import `beaconDisplayOwner`, `beaconDisplayState`, and `formatBeaconGitAge`.

Add a local helper:

```ts
function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_{}[\]<>()#+\-.!|]/gu, '\\$&')
}
```

Use `escapeMarkdown` for annotation keyword/message, owner, category, severity, rule id, source, URI, Git author/email/hash/summary, and the date value. Keep labels and Markdown list syntax literal. Add `Owner` only when `beaconDisplayOwner` returns a value and always add `State`. In the Git section add optional Email and Age in the exact order tested in Step 4. Preserve the existing category/severity/rule/source/location/Git fields.

- [ ] **Step 6: Verify the first delivery and commit**

Run:

```bash
rtk pnpm vitest tests/git-presentation.test.ts tests/hover-format.test.ts
rtk pnpm format:check
rtk pnpm lint
pnpm typecheck
rtk git add src/core/git/presentation.ts src/core/hover/format.ts tests/git-presentation.test.ts tests/hover-format.test.ts
rtk git commit -m "feat: enrich beacon metadata presentation"
```

Expected: all focused tests and static checks pass; the commit contains only pure presentation and Hover work.

### Task 2: Opt-In Explorer Metadata Schema and Tree Presentation

**Files:**

- Modify: `package.json`
- Modify: `src/meta.ts` via generation
- Modify: `README.md` via generation
- Modify: `tests/package-metadata.test.ts`
- Modify: `src/core/explorer/tree-data-provider.ts`
- Modify: `tests/tree-data-provider.test.ts`

**Interfaces:**

- Consumes: Task 1's `formatBeaconExplorerDescription` and `formatBeaconExplorerTooltip` plus `BeaconGitMetadata`.
- Produces: generated `config.git.showMetadata: boolean` and a Tree provider that accepts a metadata-map reader and deterministic clock reader.

- [ ] **Step 1: Add failing metadata and Tree tests**

In `tests/package-metadata.test.ts`, insert `'code-beacon.git.showMetadata'` immediately after `'code-beacon.git.staleDays'` in the strict configuration key list. Add:

```ts
it('declares optional Explorer Git metadata', () => {
  const showMetadata = pkg.contributes.configuration.properties[
    'code-beacon.git.showMetadata'
  ] as { default?: unknown; type?: unknown }

  expect(showMetadata).toStrictEqual({
    default: false,
    description:
      "Show Git author, age, and commit details in Code Beacon Explorer items. This uses VS Code's built-in Git extension only in trusted local desktop workspaces; unavailable Git data and virtual filesystems show no Git metadata.",
    type: 'boolean',
  })
  expectTypeOf<false>().toMatchTypeOf<
    ConfigKeyTypeMap['code-beacon.git.showMetadata']
  >()
})
```

In `tests/tree-data-provider.test.ts`, create a metadata map keyed by annotation id and construct the provider with a metadata reader and `() => new Date('2026-07-12T12:00:00.000Z')`. Assert the leaf item's description is `2:4 • @Ada • Grace Hopper • 1 day ago • resolved • ignored` and its Tooltip contains the owner/state/Git lines. For a default provider with no metadata reader, assert the current `2:4` description remains unchanged while the Tooltip contains `Owner: Unassigned`, `State: active`, and no `Git:` line.

- [ ] **Step 2: Run focused tests and confirm they fail**

Run:

```bash
rtk pnpm vitest tests/package-metadata.test.ts tests/tree-data-provider.test.ts
```

Expected: failure because the generated setting and metadata-aware Tree constructor do not exist.

- [ ] **Step 3: Add generated configuration**

Add this exact property after `code-beacon.git.staleDays` in `package.json`:

```json
"code-beacon.git.showMetadata": {
  "type": "boolean",
  "default": false,
  "description": "Show Git author, age, and commit details in Code Beacon Explorer items. This uses VS Code's built-in Git extension only in trusted local desktop workspaces; unavailable Git data and virtual filesystems show no Git metadata."
}
```

Generate deterministically:

```bash
rtk pnpm generate:meta
rtk git add src/meta.ts README.md
rtk pnpm generate:meta
rtk git diff --exit-code -- src/meta.ts README.md
```

Confirm the generated `NestedScopedConfigs` exposes `git.showMetadata` as `boolean` and README contains the exact opt-in wording.

- [ ] **Step 4: Extend the Tree provider without changing default output**

In `src/core/explorer/tree-data-provider.ts`, add these reader types:

```ts
export type GetBeaconGitMetadata = () => ReadonlyMap<string, BeaconGitMetadata>
export type GetBeaconNow = () => Date
```

Extend the constructor after `getGroupBy` with defaulted `getMetadataByAnnotationId: GetBeaconGitMetadata = () => new Map()` and `getNow: GetBeaconNow = () => new Date()`. Store both readers. Convert `createTreeItem` from the current static callback into an instance method so it can read the metadata map and current time. For leaves, obtain `metadata = this.getMetadataByAnnotationId().get(annotation.id)`. Apply the rich description only when metadata is present, preserving the current compact description otherwise. Always use the pure plain-text Tooltip so owner/state are consistently available; it adds Git fields only when metadata is present. Remove the now-unused `formatBeaconLink` import. Keep commands, context values, icons, resource URI, grouping, sorting, and children behavior unchanged.

Use `formatBeaconExplorerDescription(annotation, metadata, this.getNow())` for metadata leaves. For every Tooltip, use `formatBeaconExplorerTooltip(annotation, metadata, this.getNow())`. Do not calculate metadata, mutate maps, or call Git in this provider.

- [ ] **Step 5: Verify and commit the Tree delivery**

Run:

```bash
rtk pnpm vitest tests/package-metadata.test.ts tests/tree-data-provider.test.ts tests/git-presentation.test.ts
rtk pnpm format:check
rtk pnpm lint
pnpm typecheck
rtk git add package.json src/meta.ts README.md src/core/explorer/tree-data-provider.ts tests/package-metadata.test.ts tests/tree-data-provider.test.ts
rtk git commit -m "feat: show optional Git metadata in Explorer"
```

Expected: default Tree behavior remains stable, opt-in metadata has deterministic presentation, and generated files are staged from the second generation.

### Task 3: Explorer Hydration Policy and Release Verification

**Files:**

- Modify: `src/composables/use-beacon-explorer.ts`
- Modify: `tests/beacon-explorer.test.ts`

**Interfaces:**

- Consumes: `config.git.showMetadata`, the existing `BeaconExplorerGitMetadataIndex`, and Task 2's metadata-aware `BeaconTreeDataProvider`.
- Produces: on-demand Git hydration for stale filtering or enabled Tree metadata, with the existing generation/cancellation protections retained.

- [ ] **Step 1: Write failing hydration-policy tests**

In the Explorer config mock, set `git: { showMetadata: false, staleDays: 90 }`. Add one test that stores an annotation, invokes Explorer with `onlyStale: false` and `showMetadata: false`, flushes promises, and asserts `getMetadataForAnnotations` was not called. Add another that sets `config.git.showMetadata = true`, stores one annotation, flushes promises, and asserts the resolver was called with that document and annotation; then assert the captured Tree provider's leaf description contains the returned author and relative age.

Add an untrusted variant for `showMetadata: true` that sets `workspaceState.isTrusted = false`, flushes, and asserts no resolver call and a default leaf description. Reuse the existing document/open-text-document mocks and `flushPromises` helper; do not create a second Git test fixture.

- [ ] **Step 2: Run Explorer test and confirm the new opt-in case fails**

Run:

```bash
rtk pnpm vitest tests/beacon-explorer.test.ts
```

Expected: the opt-in test fails because `hydrateGitMetadata` currently returns unless `onlyStale` is true and the Tree provider has no metadata reader.

- [ ] **Step 3: Wire map and hydration predicate**

Pass `() => gitMetadataIndex.metadataByAnnotationId` as the third reader when creating `BeaconTreeDataProvider` in `useBeaconExplorer`.

Replace the early hydration guard with this exact policy:

```ts
if (
  (!config.explorer.onlyStale && !config.git.showMetadata) ||
  !workspace.isTrusted
) {
  return
}
```

Keep `gitMetadataIndex.clear()`, the existing `hydrationRequest` checks, document-open failure handling, `getMetadataForAnnotations` batching, and `provider.refresh()` callback unchanged. This ensures configuration events, annotation changes, and in-flight stale hydrations keep their existing invalidation behavior.

- [ ] **Step 4: Run focused and release verification**

Run:

```bash
rtk pnpm vitest tests/beacon-explorer.test.ts tests/tree-data-provider.test.ts tests/hover-format.test.ts tests/git-presentation.test.ts tests/package-metadata.test.ts
rtk pnpm format:check
rtk pnpm lint
pnpm typecheck
rtk pnpm release:check
rtk pnpm build
rtk pnpm generate:meta
rtk git diff --exit-code -- src/meta.ts README.md
rtk git diff --check
```

Expected: all commands exit 0. Document any pre-existing lint warnings separately from errors; no new lint errors are acceptable.

- [ ] **Step 5: Commit and request branch review**

Run:

```bash
rtk git add src/composables/use-beacon-explorer.ts tests/beacon-explorer.test.ts
rtk git commit -m "feat: hydrate Explorer Git metadata on demand"
```

Then use `superpowers:requesting-code-review` for the completed branch. Resolve all Critical and Important findings, repeat their covering tests, re-review, merge only after a clean final review, remove the clean isolated worktree, and rerun `rtk pnpm release:check` plus build and generated-file checks on clean `main`.

## Plan Self-Review

### Spec coverage

- Safe owner/state/Git age presentation and Markdown escaping: Task 1.
- Default-off generated Explorer setting and documentation: Task 2.
- Compact Tree description and detailed plain Tooltip without changing default Tree behavior: Task 2.
- Trusted opt-in hydration, stale-filter compatibility, and unavailable Git fallback: Task 3.
- No Git writes/new dependencies/platform regressions: Global Constraints and each task's public-API boundaries.
- Focused and release-level verification: Tasks 1 through 3.

### Placeholder scan

The plan has no unresolved design markers. Every production change defines a target file, public signature or exact behavior, a failing test, a focused command, and a commit boundary.

### Type consistency

Task 1 defines the five pure presentation exports consumed by Task 2. Task 2 defines the metadata-reader constructor contract consumed by Task 3. Task 3 supplies the existing `ReadonlyMap<string, BeaconGitMetadata>` index, matching the Task 2 reader type.
