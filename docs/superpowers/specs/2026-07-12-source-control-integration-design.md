# Source Control Integration Design

## Goal

Expose changed Git files that contain AnnoPulse annotations as a read-only AnnoPulse provider in VS Code's Source Control view, making annotation work visible alongside the user's normal SCM workflow without taking ownership of Git actions.

## Scope

- Add `annopulse.scm.enabled`, default `false`.
- When enabled, create one `AnnoPulse` `SourceControl` provider with a `Changed Annotations` resource group.
- Show one resource per changed file containing at least one current annotation.
- Open the selected file through the standard VS Code open command.
- Refresh resources from annotation-store updates and the existing changed-URI Git adapter subscription.
- Dispose provider and subscriptions whenever the setting is disabled or the extension deactivates.

Out of scope: stage/unstage/commit actions, modifying Git's own SCM provider, inline diffs, custom quick-diff providers, provider APIs, remote writes, or listing unchanged annotation files.

## Alternatives Considered

### 1. Add commands to VS Code's built-in Git SCM provider

The public extension API does not let AnnoPulse inject states into Git's existing provider. Depending on internal Git views would be fragile.

### 2. Create a AnnoPulse SCM provider for all annotation files

This makes annotations visible but duplicates Explorer at workspace scale and produces persistent Source Control noise.

### 3. Recommended: opt-in read-only provider for changed files with annotations

The provider reuses the changed-files feature, displays only actionable overlap between code changes and annotations, and does not conflict with Git's own provider. Defaulting it off preserves existing Source Control behavior until a user explicitly opts in.

## Resource Semantics

For every URI in `getChangedUris()` that has at least one annotation in `annotationStore`:

- create one `SourceControlResourceState` with `resourceUri` equal to that URI;
- set command to `{ command: 'vscode.open', title: 'Open AnnoPulse File', arguments: [resourceUri] }`;
- set `contextValue: 'annopulseChangedResource'`;
- set a `comment-discussion` theme icon and tooltip such as `3 AnnoPulse annotations (TODO, BUG)`;
- sort resource states by URI and set `sourceControl.count` to the state count.

Resolved and ignored annotations remain resources because the SCM provider reflects the current store and supports the same investigation context as Explorer. No Git metadata, file content, user input, or annotation message is sent outside VS Code.

## Lifecycle

```text
config.scm.enabled
       |
       v
useAnnoPulseSourceControl
  +-- annotationStore.subscribe -> refresh resources
  +-- useAnnoPulseGit.getChangedUris -> changed URI snapshot
  `-- useAnnoPulseGit.subscribeToChangedUris -> resnapshot + refresh
```

When disabled, the composable disposes its SourceControl instance, resource group, Git subscription, and pending refresh generation. A later async result is ignored unless it belongs to the currently enabled generation. In untrusted, virtual, absent-Git, or failing Git cases the URI set is empty and the provider has no resources; it never throws or performs a Git write.

## Components

- `src/composables/use-annotation-source-control.ts` owns VS Code SCM objects and asynchronous changed-URI lifecycle.
- `src/core/source-control/resources.ts` remains VS Code-free except for structural input/output types if needed; it groups annotations by URI and produces deterministic resource descriptors (URI, count, categories, tooltip) for unit tests.
- `src/index.ts` creates one shared `useAnnoPulseGit()` instance and supplies it to Explorer, Hover, and SCM composables so their metadata cache and Git activation boundary remain consistent.

## Testing

- Core resource tests cover grouping, count, sorted URI order, category summaries, and empty input.
- SCM composable tests cover disabled-by-default, enabled resource creation, Git snapshot/state refresh, annotation-store refresh, empty/failure/untrusted state, standard open command, count, and disposal/late-result protection.
- Package metadata tests cover setting schema and generated config.
- README and roadmap state the provider is opt-in/read-only and only lists changed files with annotations.
- Release verification runs unit, desktop, Web, build, metadata generation idempotence, and diff checks.

## Safety and Compatibility

The provider uses only VS Code's public SCM API and built-in Git extension API. It performs no shell commands, Node runtime filesystem/process calls, credential access, network requests, Git writes, document writes, or remote issue creation. In Web and virtual/no-Git hosts it remains empty rather than failing.
