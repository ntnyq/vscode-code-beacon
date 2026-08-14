# Richer Hover and Explorer Metadata Design

## Goal

Make a AnnoPulse easier to triage by showing its owner and state consistently, adding a safe, compact Git attribution summary to the Explorer when explicitly enabled, and expanding the Hover with the same contextual metadata.

## Decision

Implement presentation-only enrichment on top of the existing trusted-desktop Git adapter.

- Keep Hover's current on-demand metadata lookup and add annotation owner/state plus Git email and a normalized age when available.
- Add `annopulse.git.showMetadata`, default `false`, to opt into Explorer Git details. The setting keeps the current low-cost Explorer default while allowing maintainers to trade Git blame work for attribution in their list.
- Use the existing batch `getMetadataForAnnotations` API, cache, and generation-safe Explorer metadata index. Do not add Git commands, Git writes, filesystem/process APIs, network requests, credentials, or AI calls.

## Alternatives Considered

### 1. Always hydrate Git metadata for every Explorer refresh

This would immediately expose authors and commit data, but turns ordinary workspace navigation into potentially expensive blame work. It is unsuitable as the default for a large workspace.

### 2. Recommended: opt-in Explorer metadata with existing Git adapter

The Tree remains fast by default. In a trusted local desktop workspace, users who enable the setting get author, relative age, short commit, and summary from the already-tested Git integration. The same unavailable-Git behavior remains an empty metadata map.

### 3. Add a new Git process or a remote API for richer history

This expands permissions and platform risk without solving the immediate presentation gap. It is out of scope.

## User-Facing Behavior

### Hover

Every Hover keeps its current keyword, message, category, severity, rule, source, and location. It additionally shows:

- `Owner: @name` when the scanner captured a non-empty owner; whitespace-only owners are omitted and displayed as unassigned in the Explorer Tooltip;
- `State: active`, `resolved`, `ignored`, or `resolved, ignored`;
- Git author, email when supplied by the Git extension, absolute commit date, normalized relative age, short hash, and commit summary when trusted Git metadata is available.

All annotation and Git text that is interpolated into Markdown is escaped. A comment message or commit summary therefore cannot create deceptive headings, links, code fences, or formatting in the Hover.

### Explorer

Without `annopulse.git.showMetadata`, Tree labels, descriptions, and Git hydration preserve their current behavior (except the richer state wording in the Tooltip).

With the setting enabled in a trusted local desktop workspace:

- A leaf description remains compact: `line:column`, optional `@owner`, optional Git author, optional relative age, then `resolved` and/or `ignored`.
- A leaf Tooltip becomes a multiline plain-text summary of keyword/message, location, owner, state, and Git author/email/date/age/short hash/summary when present.
- Invalid or missing dates omit age rather than inventing a value. A future Git date is displayed as `today` to avoid a negative age.

Resolved and ignored annotations continue to use their existing Tree context values, filters, and reveal command. Metadata only improves presentation; it never changes membership, sort order, filtering, or commands.

## Architecture

```text
annotationStore + optional Git metadata map
            |
            +--> pure presentation helpers
            |      - state labels
            |      - validated relative age
            |      - plain Explorer description/tooltip
            |      - Markdown-safe Hover values
            |
            +--> AnnoPulseTreeDataProvider
            |      - read metadata by annotation id
            |
            `--> formatAnnoPulseHoverMarkdown

Explorer configuration change / store change
            |
            `--> hydrate Git metadata only when
                 workspace is trusted AND
                 (onlyStale OR git.showMetadata)
```

### Pure Presentation Boundary

Create a focused pure module under `src/core/git/` for:

- converting a valid ISO commit date plus an injected `now` time to `today`, `1 day ago`, or `N days ago`;
- deriving the stable annotation state labels;
- assembling compact plain Explorer metadata without VS Code objects.

It receives a `AnnoPulseAnnotation`, optional `AnnoPulseGitMetadata`, and `Date`; it does not call VS Code or Git. Hover remains responsible for Markdown escaping because its output is Markdown, while Tree tooltips remain plain text.

### Explorer Wiring

`AnnoPulseTreeDataProvider` receives a read-only metadata-map reader in addition to its annotation and grouping readers. It remains responsible for TreeItem construction but delegates display strings to the pure presentation helper. `useAnnoPulseExplorer` passes its existing `AnnoPulseExplorerGitMetadataIndex.metadataByAnnotationId` map to the provider.

`hydrateGitMetadata` retains its generation guard and existing per-document batch resolution. It hydrates only when `workspace.isTrusted` and either stale filtering or the opt-in metadata setting needs Git data. Disabled, untrusted, virtual, unavailable, or failing Git leaves an empty map and a fully functional Tree.

## Configuration and Documentation

Add this generated configuration schema:

```json
"annopulse.git.showMetadata": {
  "type": "boolean",
  "default": false,
  "description": "Show Git author, age, and commit details in AnnoPulse Explorer items. This uses VS Code's built-in Git extension only in trusted local desktop workspaces; unavailable Git data and virtual filesystems show no Git metadata."
}
```

The package metadata test asserts the key, default, and generated config type. `pnpm generate:meta` is the only source for `src/meta.ts` and the README configuration table.

## Testing

- Pure presentation tests cover every state combination, valid singular/plural age, invalid dates, future dates, ownerless annotations, and optional Git fields.
- Hover formatter tests cover owner/state/Git email/age and Markdown escaping for annotation messages, owners, authors, and commit summaries.
- Tree provider tests cover compact descriptions and plain-text tooltips with and without metadata, including resolved and ignored states.
- Explorer composable tests prove hydration remains off by default, becomes active for `git.showMetadata` in a trusted workspace, and remains empty in untrusted or failing-Git cases.
- Metadata/package tests cover the setting schema and generated config type.
- Release verification runs format, lint, typecheck, unit tests, desktop E2E, Web smoke, build, metadata generation idempotence, and generated-file diff checks.

## Safety and Compatibility

This feature uses only the existing public VS Code Git extension API. It adds no new activation events or runtime dependencies. The default configuration performs no extra Git blame hydration, and Web, Remote, Virtual Workspace, untrusted workspace, and no-Git hosts degrade to presentation without Git fields.
