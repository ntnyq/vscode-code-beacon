# vscode-code-beacon

[![GitHub release](https://img.shields.io/github/v/release/ntnyq/vscode-code-beacon?include_prereleases&label=Visual%20Studio%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=ntnyq.vscode-code-beacon)
[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/ntnyq/vscode-code-beacon/ci.yml?branch=main)](https://github.com/ntnyq/vscode-code-beacon/actions/workflows/ci.yml)
[![GitHub top language](https://img.shields.io/github/languages/top/ntnyq/vscode-code-beacon)](https://github.com/ntnyq/vscode-code-beacon)
[![GitHub](https://img.shields.io/github/license/ntnyq/vscode-code-beacon)](https://github.com/ntnyq/vscode-code-beacon/blob/main/LICENSE)

## Commands

<!-- commands -->

| Command               | Title                            |
| --------------------- | -------------------------------- |
| `code-beacon.enable`  | Code Beacon: Enable Code Beacon  |
| `code-beacon.disable` | Code Beacon: Disable Code Beacon |

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

<!-- configs-list -->

## VS Code Web

This extension supports browser-based VS Code environments, including [vscode.dev](https://vscode.dev) and [github.dev](https://github.dev).
Runtime file access uses the VS Code Workspace FS API, so SCSS dependency resolution can work with web and virtual workspace file systems when those files are readable by VS Code.

## License

[MIT](./LICENSE) License © 2026-PRESENT [ntnyq](https://github.com/ntnyq)
