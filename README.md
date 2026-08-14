# AnnoPulse

[![GitHub release](https://img.shields.io/github/v/release/ntnyq/vscode-annopulse?include_prereleases&label=Visual%20Studio%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=ntnyq.annopulse)
[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/ntnyq/vscode-annopulse/ci.yml?branch=main)](https://github.com/ntnyq/vscode-annopulse/actions/workflows/ci.yml)
[![GitHub top language](https://img.shields.io/github/languages/top/ntnyq/vscode-annopulse)](https://github.com/ntnyq/vscode-annopulse)
[![GitHub](https://img.shields.io/github/license/ntnyq/vscode-annopulse)](https://github.com/ntnyq/vscode-annopulse/blob/main/LICENSE)

AnnoPulse highlights actionable code annotations such as `TODO`, `FIXME`, `BUG`, `NOTE`, `REVIEW`, `SECURITY`, and `PERF`.
It scans comments, decorates matching ranges, lists results in a dedicated explorer, can publish Problems diagnostics, and exports findings as Markdown, JSON, or CSV.

## Features

- Highlight built-in and custom annotation rules in visible editors.
- Browse annotations in the AnnoPulse explorer and reveal an annotation in its source file.
- Scan the active file, visible editors, or the full workspace with include/exclude controls.
- Scan opened notebook cells through the normal Explorer, Problems, and CodeLens paths.
- Optionally publish annotations to VS Code Problems.
- Copy links or Markdown and export all annotations as Markdown, JSON, or CSV.
- Resolve or ignore annotations with state persisted for the current workspace; reopen or unignore them when the work resumes.
- Filter Explorer results by scope, category, severity, owner, or text query, and choose whether resolved and ignored annotations remain visible.
- Focus the Explorer on staged, unstaged, merge-conflict, and untracked files reported by VS Code's built-in Git extension.
- Enrich annotation hovers with the blamed commit's author, date, short hash, and summary in trusted desktop workspaces.
- Optionally expose changed files containing annotations through a read-only Source Control provider.
- Opt into AI commands and read-only Language Model Tools for explanations, generated-fix previews, workspace summaries, and annotation quality checks.
- Run in desktop VS Code, VS Code Web, and virtual workspaces where files are readable through the VS Code workspace API.

## Custom Rules

`annopulse.rules` can override built-in rules by `id` or add new rules:

```json
{
  "annopulse.rules": [
    {
      "id": "blocked",
      "label": "BLOCKED",
      "category": "custom",
      "matcher": {
        "type": "text",
        "value": "BLOCKED",
        "wholeWord": true,
        "colon": "optional"
      },
      "severity": "warning",
      "style": {
        "backgroundColor": "#cf222e",
        "overviewRulerColor": "#cf222e"
      }
    }
  ]
}
```

## Commands

<!-- commands -->

| Command                        | Title                                        |
| ------------------------------ | -------------------------------------------- |
| `annopulse.enable`             | AnnoPulse: Enable AnnoPulse                  |
| `annopulse.disable`            | AnnoPulse: Disable AnnoPulse                 |
| `annopulse.toggle`             | AnnoPulse: Toggle AnnoPulse                  |
| `annopulse.refresh`            | AnnoPulse: Refresh Annotations               |
| `annopulse.scanWorkspace`      | AnnoPulse: Scan Workspace for Annotations    |
| `annopulse.scanActiveFile`     | AnnoPulse: Scan Active File for Annotations  |
| `annopulse.scanOpenEditors`    | AnnoPulse: Scan Open Editors for Annotations |
| `annopulse.focusExplorer`      | AnnoPulse: Focus AnnoPulse Explorer          |
| `annopulse.reveal`             | AnnoPulse: Reveal Annotation                 |
| `annopulse.copyLink`           | AnnoPulse: Copy Annotation Link              |
| `annopulse.copyMarkdown`       | AnnoPulse: Copy Annotation as Markdown       |
| `annopulse.createIssue`        | AnnoPulse: Create Issue Body                 |
| `annopulse.explain`            | AnnoPulse: Explain Annotation                |
| `annopulse.generateFix`        | AnnoPulse: Generate Annotation Fix           |
| `annopulse.summarizeWorkspace` | AnnoPulse: Summarize Workspace Annotations   |
| `annopulse.resolve`            | AnnoPulse: Resolve Annotation                |
| `annopulse.unresolve`          | AnnoPulse: Reopen Annotation                 |
| `annopulse.ignore`             | AnnoPulse: Ignore Annotation                 |
| `annopulse.unignore`           | AnnoPulse: Unignore Annotation               |
| `annopulse.exportMarkdown`     | AnnoPulse: Export Annotations as Markdown    |
| `annopulse.exportJson`         | AnnoPulse: Export Annotations as JSON        |
| `annopulse.exportCsv`          | AnnoPulse: Export Annotations as CSV         |
| `annopulse.openSettings`       | AnnoPulse: Open AnnoPulse Settings           |
| `annopulse.clearCache`         | AnnoPulse: Clear AnnoPulse Cache             |

<!-- commands -->

## Create Issue Body

In the AnnoPulse Explorer, select an annotation and invoke **AnnoPulse: Create Issue Body**. The command copies GitHub-compatible Markdown for that annotation to your clipboard, ready to edit and paste into an issue.

Create Issue Body only copies local Markdown: it does not create a remote issue, send a network request, or require an issue-tracker account.

## Git-aware workflows

Set `annopulse.explorer.scope` to `changedFiles` to show annotations only in staged, unstaged, merge-conflict, and untracked files reported by VS Code's built-in Git extension.

Enable `annopulse.scm.enabled` to add a read-only **AnnoPulse** provider to the Source Control view. It lists changed files that contain indexed annotations and opens the selected file; it never stages, unstages, commits, or modifies Git state.

Enable `annopulse.git.showMetadata` to add the blamed commit's author, date, short hash, and summary to Explorer items. The same metadata is available in annotation hovers without enabling the Explorer setting. Stale filtering uses this metadata when `annopulse.explorer.onlyStale` is enabled.

These integrations require a trusted local desktop workspace, a non-virtual repository, and VS Code's built-in Git extension. The rest of AnnoPulse remains available when Git metadata is unavailable.

## AI-assisted workflows

Set `annopulse.ai.enabled` to `true` to enable AnnoPulse's AI commands and Language Model Tools:

- **Explain Annotation** sends the selected annotation and a bounded source window to a VS Code language model, then opens the explanation locally.
- **Generate Annotation Fix** requests a bounded replacement proposal. AnnoPulse validates it against the current document and applies it through a confirmation-required `WorkspaceEdit`.
- **Summarize Workspace Annotations** sends a bounded digest of annotations already held in the in-memory index; it does not read arbitrary workspace files.
- The read-only `annopulse_list_annotations` and `annopulse_quality_check` tools share bounded, already-indexed annotation data only after VS Code presents a confirmation prompt.

AI actions run only when explicitly invoked, show cancellable progress, and use VS Code's language model API. AnnoPulse does not enable AI-action telemetry or configure a telemetry destination.

## Configs

<!-- configs-list -->

#### `annopulse.enable`

Description: Enable or disable AnnoPulse.  
Type: `boolean`  
Default: `true`

#### `annopulse.languages`

Description: Language IDs where annotations are scanned. Use '\*' for all languages and prefix with '!' to exclude.  
Type: `array`  
Default: `["*"]`

#### `annopulse.rules`

Description: Custom annotation rules. Built-in rules are enabled unless a custom rule with the same id overrides them.  
Type: `array`  
Default: `[]`

#### `annopulse.include`

Description: Glob patterns that define files to scan.  
Type: `array`  
Default: `["**/*"]`

#### `annopulse.exclude`

Description: Glob patterns that define files and folders to exclude from workspace scans.  
Type: `array`  
Default: See package.json

#### `annopulse.respectFilesExclude`

Description: Respect VS Code files.exclude during workspace scans.  
Type: `boolean`  
Default: `true`

#### `annopulse.respectSearchExclude`

Description: Respect VS Code search.exclude during workspace scans.  
Type: `boolean`  
Default: `true`

#### `annopulse.maxFileSize`

Description: Maximum document text length, in characters, to scan. Set to 0 to disable this size limit.  
Type: `number`  
Default: `1000000`

#### `annopulse.maxFilesForSearch`

Description: Maximum number of files to scan during workspace scans.  
Type: `number`  
Default: `5000`

#### `annopulse.scanMode`

Description: Default scan mode for AnnoPulse.  
Type: `string`  
Default: `"visibleEditors"`

#### `annopulse.commentOnly`

Description: Prefer scanning comments only when AnnoPulse knows the language comment syntax.  
Type: `boolean`  
Default: `true`

#### `annopulse.decorations.enabled`

Description: Show editor decorations for annotations.  
Type: `boolean`  
Default: `true`

#### `annopulse.diagnostics.mode`

Description: Controls Problems integration.  
Type: `string`  
Default: `"off"`

#### `annopulse.explorer.enabled`

Description: Enable the AnnoPulse TreeView.  
Type: `boolean`  
Default: `true`

#### `annopulse.explorer.groupBy`

Description: Default grouping mode for the AnnoPulse TreeView.  
Type: `string`  
Default: `"file"`

#### `annopulse.explorer.scope`

Description: Limits AnnoPulse Explorer results to the workspace, active file, visible editors, or changed files. When set to "changedFiles", the Explorer includes files reported by VS Code's built-in Git extension as staged, unstaged, merge-conflict, or untracked changes. This scope is available only for trusted local desktop workspaces; unavailable Git data, virtual filesystems, and untrusted workspaces produce an empty changed-files view.  
Type: `string`  
Default: `"workspace"`

#### `annopulse.explorer.categories`

Description: Categories shown in the AnnoPulse Explorer. Leave empty to show all categories.  
Type: `array`  
Default: `[]`

#### `annopulse.explorer.severities`

Description: Severities shown in the AnnoPulse Explorer. Leave empty to show all severities.  
Type: `array`  
Default: `[]`

#### `annopulse.explorer.owners`

Description: Owners shown in the AnnoPulse Explorer. Leave empty to show all owners.  
Type: `array`  
Default: `[]`

#### `annopulse.explorer.query`

Description: Case-insensitive text query for AnnoPulse Explorer results.  
Type: `string`  
Default: `""`

#### `annopulse.explorer.includeResolved`

Description: Show resolved annotations in the AnnoPulse Explorer.  
Type: `boolean`  
Default: `false`

#### `annopulse.explorer.includeIgnored`

Description: Show ignored annotations in the AnnoPulse Explorer.  
Type: `boolean`  
Default: `false`

#### `annopulse.explorer.onlyStale`

Description: Show only annotations with a valid Git commit date older than the configured stale threshold.  
Type: `boolean`  
Default: `false`

#### `annopulse.explorer.onlyOwnerless`

Description: Show only annotations with no explicit owner or a whitespace-only owner. Git authors do not implicitly assign an annotation.  
Type: `boolean`  
Default: `false`

#### `annopulse.git.staleDays`

Description: Number of days after which a valid Git commit date is considered stale.  
Type: `integer`  
Default: `90`

#### `annopulse.git.showMetadata`

Description: Show Git author, age, and commit details in AnnoPulse Explorer items. This uses VS Code's built-in Git extension only in trusted local desktop workspaces; unavailable Git data and virtual filesystems show no Git metadata.  
Type: `boolean`  
Default: `false`

#### `annopulse.ai.enabled`

Description: Enable AnnoPulse AI features. Read-only Language Model Tools share only already-indexed annotations after confirmation; user-triggered AI commands send only bounded context for a selected annotation or a bounded summary of already-indexed workspace annotations.  
Type: `boolean`  
Default: `false`

#### `annopulse.scm.enabled`

Description: Show a read-only AnnoPulse Source Control provider for changed Git files containing annotations. It never stages, unstages, commits, or modifies Git; unavailable Git data, virtual filesystems, and untrusted workspaces produce an empty list.  
Type: `boolean`  
Default: `false`

#### `annopulse.codelens.enabled`

Description: Enable CodeLens actions above annotation lines.  
Type: `boolean`  
Default: `false`

#### `annopulse.hover.enabled`

Description: Enable hover details for annotations.  
Type: `boolean`  
Default: `true`

<!-- configs-list -->

## Explorer stale and ownerless filters

`annopulse.explorer.onlyOwnerless` considers only an annotation's explicit `owner` value: an omitted or whitespace-only value is ownerless, and a Git commit author does not assign it.

When `annopulse.explorer.onlyStale` is enabled, AnnoPulse looks up blame metadata in batches through VS Code's built-in Git API and compares valid commit dates against `annopulse.git.staleDays`. This requires a trusted local desktop workspace with an available non-virtual Git repository. Git metadata is not requested when the stale filter is off.

If metadata is unavailable, invalid, or cannot be resolved, the annotation is treated as having an unknown age and is not included by the stale filter. The rest of the Explorer remains available.

## VS Code Web

This extension supports browser-based VS Code environments, including [vscode.dev](https://vscode.dev) and [github.dev](https://github.dev).
Runtime file access uses VS Code workspace APIs, so workspace scans work with web and virtual workspace file systems when those files are readable by VS Code.
Git-aware Explorer scope, Git metadata, and the Source Control provider use VS Code's built-in Git API only in trusted desktop workspaces. VS Code Web, virtual workspaces, untrusted workspaces, and unavailable Git metadata retain the base scanning, Explorer, diagnostics, and hover workflows without Git enrichment.
CI checks cover unit tests, the desktop Extension Host, browser-host virtual workspaces, and VSIX packaging.

## License

[MIT](./LICENSE) License © 2026-PRESENT [ntnyq](https://github.com/ntnyq)
