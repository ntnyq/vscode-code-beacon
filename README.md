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
- Optionally publish annotations to VS Code Problems.
- Copy links or Markdown and export all beacons as Markdown, JSON, or CSV.
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
| `code-beacon.exportMarkdown`  | Code Beacon: Export Beacons as Markdown    |
| `code-beacon.exportJson`      | Code Beacon: Export Beacons as JSON        |
| `code-beacon.exportCsv`       | Code Beacon: Export Beacons as CSV         |
| `code-beacon.openSettings`    | Code Beacon: Open Code Beacon Settings     |
| `code-beacon.clearCache`      | Code Beacon: Clear Code Beacon Cache       |

<!-- commands -->

## Configs

<!-- configs-list -->

#### `code-beacon.enable`

Description: Enable or disable code beacon.  
Type: `boolean`  
Default: `true`

#### `code-beacon.debug`

Description: Enable debug logging.  
Type: `boolean`  
Default: `false`

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

#### `code-beacon.codelens.enabled`

Description: Enable CodeLens actions above annotation lines.  
Type: `boolean`  
Default: `false`

#### `code-beacon.hover.enabled`

Description: Enable hover details for annotations.  
Type: `boolean`  
Default: `true`

#### `code-beacon.export.defaultFormat`

Description: Default export format.  
Type: `string`  
Default: `"markdown"`

<!-- configs-list -->

## VS Code Web

This extension supports browser-based VS Code environments, including [vscode.dev](https://vscode.dev) and [github.dev](https://github.dev).
Runtime file access uses VS Code workspace APIs, so workspace scans work with web and virtual workspace file systems when those files are readable by VS Code.

## License

[MIT](./LICENSE) License © 2026-PRESENT [ntnyq](https://github.com/ntnyq)
