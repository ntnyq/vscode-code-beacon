# Code Beacon

[![GitHub release](https://img.shields.io/github/v/release/ntnyq/vscode-code-beacon?include_prereleases&label=Visual%20Studio%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=ntnyq.vscode-code-beacon)
[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/ntnyq/vscode-code-beacon/ci.yml?branch=main)](https://github.com/ntnyq/vscode-code-beacon/actions/workflows/ci.yml)
[![GitHub top language](https://img.shields.io/github/languages/top/ntnyq/vscode-code-beacon)](https://github.com/ntnyq/vscode-code-beacon)
[![GitHub](https://img.shields.io/github/license/ntnyq/vscode-code-beacon)](https://github.com/ntnyq/vscode-code-beacon/blob/main/LICENSE)

Code Beacon highlights actionable code annotations such as `TODO`, `FIXME`, `BUG`, `NOTE`, `REVIEW`, `SECURITY`, and `PERF`.
It scans comments, decorates matching ranges, lists results in a dedicated explorer, can publish Problems diagnostics, and exports findings as Markdown, JSON, or CSV.

## Features

- Highlight built-in and custom annotation rules in visible editors.
- Browse annotations in the Code Beacon explorer and reveal a beacon in its source file.
- Scan the active file, visible editors, or the full workspace with include/exclude controls.
- Scan opened notebook cells through the normal Explorer, Problems, and CodeLens paths.
- Optionally publish annotations to VS Code Problems.
- Copy links or Markdown and export all beacons as Markdown, JSON, or CSV.
- Resolve or ignore beacons with state persisted for the current workspace; reopen or unignore them when the work resumes.
- Filter Explorer results by scope, category, severity, owner, or text query, and choose whether resolved and ignored beacons remain visible.
- Enrich annotation hovers with the blamed commit's author, date, short hash, and summary in trusted desktop workspaces.
- Run in desktop VS Code, VS Code Web, and virtual workspaces where files are readable through the VS Code workspace API.

## Custom Rules

`code-beacon.rules` can override built-in rules by `id` or add new rules:

```json
{
  "code-beacon.rules": [
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

| Command                       | Title                                      |
| ----------------------------- | ------------------------------------------ |
| `code-beacon.enable`          | Code Beacon: Enable Code Beacon            |
| `code-beacon.disable`         | Code Beacon: Disable Code Beacon           |
| `code-beacon.toggle`          | Code Beacon: Toggle Code Beacon            |
| `code-beacon.refresh`         | Code Beacon: Refresh Beacons               |
| `code-beacon.scanWorkspace`   | Code Beacon: Scan Workspace for Beacons    |
| `code-beacon.scanActiveFile`  | Code Beacon: Scan Active File for Beacons  |
| `code-beacon.scanOpenEditors` | Code Beacon: Scan Open Editors for Beacons |
| `code-beacon.focusExplorer`   | Code Beacon: Focus Code Beacon Explorer    |
| `code-beacon.reveal`          | Code Beacon: Reveal Beacon                 |
| `code-beacon.copyLink`        | Code Beacon: Copy Beacon Link              |
| `code-beacon.copyMarkdown`    | Code Beacon: Copy Beacon as Markdown       |
| `code-beacon.createIssue`     | Code Beacon: Create Issue Body             |
| `code-beacon.resolve`         | Code Beacon: Resolve Beacon                |
| `code-beacon.unresolve`       | Code Beacon: Reopen Beacon                 |
| `code-beacon.ignore`          | Code Beacon: Ignore Beacon                 |
| `code-beacon.unignore`        | Code Beacon: Unignore Beacon               |
| `code-beacon.exportMarkdown`  | Code Beacon: Export Beacons as Markdown    |
| `code-beacon.exportJson`      | Code Beacon: Export Beacons as JSON        |
| `code-beacon.exportCsv`       | Code Beacon: Export Beacons as CSV         |
| `code-beacon.openSettings`    | Code Beacon: Open Code Beacon Settings     |
| `code-beacon.clearCache`      | Code Beacon: Clear Code Beacon Cache       |

<!-- commands -->

## Create Issue Body

In the Code Beacon Explorer, select a beacon and invoke **Code Beacon: Create Issue Body**. The command copies GitHub-compatible Markdown for that beacon to your clipboard, ready to edit and paste into an issue.

Create Issue Body only copies local Markdown: it does not create a remote issue, send a network request, or require an issue-tracker account.

## Configs

<!-- configs-list -->

#### `code-beacon.enable`

Description: Enable or disable code beacon.  
Type: `boolean`  
Default: `true`

#### `code-beacon.languages`

Description: Language IDs where annotations are scanned. Use '\*' for all languages and prefix with '!' to exclude.  
Type: `array`  
Default: `["*"]`

#### `code-beacon.rules`

Description: Custom annotation rules. Built-in rules are enabled unless a custom rule with the same id overrides them.  
Type: `array`  
Default: `[]`

#### `code-beacon.include`

Description: Glob patterns that define files to scan.  
Type: `array`  
Default: `["**/*"]`

#### `code-beacon.exclude`

Description: Glob patterns that define files and folders to exclude from workspace scans.  
Type: `array`  
Default: See package.json

#### `code-beacon.respectFilesExclude`

Description: Respect VS Code files.exclude during workspace scans.  
Type: `boolean`  
Default: `true`

#### `code-beacon.respectSearchExclude`

Description: Respect VS Code search.exclude during workspace scans.  
Type: `boolean`  
Default: `true`

#### `code-beacon.maxFileSize`

Description: Maximum document text length, in characters, to scan. Set to 0 to disable this size limit.  
Type: `number`  
Default: `1000000`

#### `code-beacon.maxFilesForSearch`

Description: Maximum number of files to scan during workspace scans.  
Type: `number`  
Default: `5000`

#### `code-beacon.scanMode`

Description: Default scan mode for Code Beacon.  
Type: `string`  
Default: `"visibleEditors"`

#### `code-beacon.commentOnly`

Description: Prefer scanning comments only when Code Beacon knows the language comment syntax.  
Type: `boolean`  
Default: `true`

#### `code-beacon.decorations.enabled`

Description: Show editor decorations for annotations.  
Type: `boolean`  
Default: `true`

#### `code-beacon.diagnostics.mode`

Description: Controls Problems integration.  
Type: `string`  
Default: `"off"`

#### `code-beacon.explorer.enabled`

Description: Enable the Code Beacon TreeView.  
Type: `boolean`  
Default: `true`

#### `code-beacon.explorer.groupBy`

Description: Default grouping mode for the Code Beacon TreeView.  
Type: `string`  
Default: `"file"`

#### `code-beacon.explorer.scope`

Description: Limits Code Beacon Explorer results to the workspace, active file, or visible editors.  
Type: `string`  
Default: `"workspace"`

#### `code-beacon.explorer.categories`

Description: Categories shown in the Code Beacon Explorer. Leave empty to show all categories.  
Type: `array`  
Default: `[]`

#### `code-beacon.explorer.severities`

Description: Severities shown in the Code Beacon Explorer. Leave empty to show all severities.  
Type: `array`  
Default: `[]`

#### `code-beacon.explorer.owners`

Description: Owners shown in the Code Beacon Explorer. Leave empty to show all owners.  
Type: `array`  
Default: `[]`

#### `code-beacon.explorer.query`

Description: Case-insensitive text query for Code Beacon Explorer results.  
Type: `string`  
Default: `""`

#### `code-beacon.explorer.includeResolved`

Description: Show resolved beacons in the Code Beacon Explorer.  
Type: `boolean`  
Default: `false`

#### `code-beacon.explorer.includeIgnored`

Description: Show ignored beacons in the Code Beacon Explorer.  
Type: `boolean`  
Default: `false`

#### `code-beacon.explorer.onlyStale`

Description: Show only beacons with a valid Git commit date older than the configured stale threshold.  
Type: `boolean`  
Default: `false`

#### `code-beacon.explorer.onlyOwnerless`

Description: Show only beacons with no explicit owner or a whitespace-only owner. Git authors do not implicitly assign a beacon.  
Type: `boolean`  
Default: `false`

#### `code-beacon.git.staleDays`

Description: Number of days after which a valid Git commit date is considered stale.  
Type: `integer`  
Default: `90`

#### `code-beacon.codelens.enabled`

Description: Enable CodeLens actions above annotation lines.  
Type: `boolean`  
Default: `false`

#### `code-beacon.hover.enabled`

Description: Enable hover details for annotations.  
Type: `boolean`  
Default: `true`

<!-- configs-list -->

## Explorer stale and ownerless filters

`code-beacon.explorer.onlyOwnerless` considers only an annotation's explicit `owner` value: an omitted or whitespace-only value is ownerless, and a Git commit author does not assign it.

When `code-beacon.explorer.onlyStale` is enabled, Code Beacon looks up blame metadata in batches through VS Code's built-in Git API and compares valid commit dates against `code-beacon.git.staleDays`. This requires a trusted local desktop workspace with an available non-virtual Git repository. Git metadata is not requested when the stale filter is off.

If metadata is unavailable, invalid, or cannot be resolved, the beacon is treated as having an unknown age and is not included by the stale filter. The rest of the Explorer remains available.

## VS Code Web

This extension supports browser-based VS Code environments, including [vscode.dev](https://vscode.dev) and [github.dev](https://github.dev).
Runtime file access uses VS Code workspace APIs, so workspace scans work with web and virtual workspace file systems when those files are readable by VS Code.
Git hover enrichment uses VS Code's built-in Git API only in trusted desktop workspaces. VS Code Web, virtual workspaces, untrusted workspaces, and unavailable Git metadata retain the base annotation hover without a Git section.
Automated checks cover both the desktop Extension Host and browser-host virtual workspaces.

## License

[MIT](./LICENSE) License © 2026-PRESENT [ntnyq](https://github.com/ntnyq)
