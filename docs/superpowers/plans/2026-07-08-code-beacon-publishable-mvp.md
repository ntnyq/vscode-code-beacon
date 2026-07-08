# Code Beacon Publishable MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a publishable Code Beacon MVP that scans code annotations, highlights them in visible editors, lists them in a TreeView, optionally reports them in Problems, exports them, and packages cleanly for the VS Code Marketplace.

**Architecture:** Implement a small pure core first: rule normalization, matching, comment ranges, document scanning, and an annotation store. Then wire that core into reactive-vscode composables for decorations, commands, TreeView, diagnostics, workspace scanning, and export. Keep Git blame and AI out of this first publishable MVP; they become separate follow-up plans after the annotation model is stable.

**Tech Stack:** VS Code extension API `^1.125.0`, TypeScript strict mode, reactive-vscode `^1.0.2`, tsdown `^0.22.3`, vitest `^4.1.10`, vscode-ext-gen `^1.6.0`, pnpm `11.10.0`.

## Global Constraints

- Extension display name is `Code Beacon`; npm package name is `vscode-code-beacon`; contributed configuration scope is `code-beacon`.
- Keep `main` and `browser` as `./dist/index.js`; runtime must keep supporting VS Code Web, Remote, and Virtual Workspaces.
- Do not add runtime dependencies for the MVP unless a task explicitly revises this plan; use VS Code APIs, reactive-vscode, and local pure functions.
- Do not make `ripgrep`, Node `fs`, Git shell commands, or AI APIs required for the MVP.
- Default Problems integration must remain off: `code-beacon.diagnostics.mode` default is `"off"`.
- Use `workspace.fs` or `workspace.openTextDocument` for workspace reads; avoid Node-only filesystem APIs in extension runtime.
- Generate `src/meta.ts` with `pnpm generate:meta` after editing `package.json`; do not hand-edit generated metadata except in tests.
- Follow repository command policy: prefix shell commands with `rtk` except `pnpm typecheck`.
- Each task ends with `rtk pnpm format:check`, `rtk pnpm lint`, `pnpm typecheck`, and the task-specific vitest command unless the task states a narrower verification.

---

## Scope Check

`docs/plan.md` describes Phase 1 through Phase 4. This plan implements a publishable MVP from Phase 1 plus the smallest Phase 2 pieces needed for marketplace usefulness: workspace scan, TreeView, Problems mode, export, docs, packaging, and smoke tests. Git blame, stale-age filters, ownerless analysis, Language Model Tool contributions, AI fix generation, and issue creation are intentionally excluded because they are independent subsystems with different security and API risks.

Follow-up plans after this MVP ships:

- `code-beacon-git-blame.md`
- `code-beacon-ai-tools.md`
- `code-beacon-notebook-polish.md`

## File Structure

Create focused files with these responsibilities:

- `src/types/annotation.ts`: shared public domain types: rule, matcher, annotation, serialized ranges, config enums.
- `src/constants/defaults.ts`: default rules, default include/exclude lists, default style values.
- `src/core/rules/normalize.ts`: merge built-in and user rules, validate regexes, compile matchers.
- `src/core/scanner/matchers.ts`: run compiled text and regex matchers against text ranges.
- `src/core/scanner/comment-ranges.ts`: identify comment ranges for common languages with fallback behavior.
- `src/core/scanner/scan-document.ts`: pure document scanning from text, language, URI, and rules.
- `src/core/store/annotation-store.ts`: mutable in-memory store with subscribe/set/get operations.
- `src/decorations/decoration-type-cache.ts`: cache `TextEditorDecorationType` by stable rule/style key.
- `src/decorations/apply-decorations.ts`: apply grouped annotations to an editor.
- `src/composables/use-beacon-highlight.ts`: watch visible editors and update scan/store/decorations.
- `src/commands/index.ts`: register all commands.
- `src/commands/navigation.ts`: reveal annotations and copy links.
- `src/commands/export.ts`: export annotations to Markdown/JSON/CSV strings and workspace files.
- `src/providers/tree-data-provider.ts`: TreeView provider backed by annotation store.
- `src/providers/diagnostics.ts`: DiagnosticCollection bridge backed by annotation store.
- `src/core/scanner/scan-workspace.ts`: workspace scanning with include/exclude and `workspace.findFiles`.
- `src/utils/editor-filter.ts`: exclude output/debug/terminal documents from scanning.
- `src/utils/ranges.ts`: convert serialized ranges to VS Code ranges and links.
- `playground/annotations.ts`: sample annotation fixture for e2e and manual verification.
- `tests/*.test.ts`: vitest unit tests for every pure module and provider-level behavior.
- `tests/e2e/run.ts`: minimal build-output smoke test used by the existing `test:e2e` script.
- `README.md`: marketplace-facing docs generated/updated for commands, config, usage, and limitations.

## Task 1: Marketplace Metadata, Configuration Schema, and Generated Meta

**Files:**

- Modify: `package.json`
- Modify: `src/meta.ts` via `pnpm generate:meta`
- Modify: `README.md`
- Create: `tests/package-metadata.test.ts`

**Interfaces:**

- Produces: `commands` and `configs` generated by `src/meta.ts`.
- Produces config keys consumed by later tasks: `config.rules`, `config.languages`, `config.include`, `config.exclude`, `config.scanMode`, `config.commentOnly`, `config.decorations.enabled`, `config.diagnostics.mode`, `config.explorer.enabled`, `config.explorer.groupBy`, `config.codelens.enabled`, `config.hover.enabled`, `config.export.defaultFormat`.

- [ ] **Step 1: Write the failing metadata test**

Create `tests/package-metadata.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
  activationEvents: string[]
  categories: string[]
  keywords: string[]
  extensionKind?: string[]
  capabilities: {
    virtualWorkspaces: { supported: boolean }
    untrustedWorkspaces: {
      supported: boolean | 'limited'
      restrictedConfigurations: string[]
    }
  }
  contributes: {
    commands: { command: string; title: string }[]
    configuration: { properties: Record<string, unknown> }
    viewsContainers?: { activitybar: { id: string; title: string }[] }
    views?: { codeBeacon: { id: string; name: string }[] }
  }
}

describe('package metadata', () => {
  it('declares marketplace metadata for Code Beacon', () => {
    expect(pkg.categories).toEqual(['Other', 'Linters', 'Visualization'])
    expect(pkg.keywords).toContain('todo')
    expect(pkg.keywords).toContain('annotation')
    expect(pkg.keywords).toContain('problems')
    expect(pkg.extensionKind).toEqual(['ui', 'workspace'])
    expect(pkg.capabilities.virtualWorkspaces.supported).toBe(true)
    expect(pkg.capabilities.untrustedWorkspaces.supported).toBe('limited')
  })

  it('declares the publishable command surface', () => {
    const commandIds = pkg.contributes.commands.map(command => command.command)

    expect(commandIds).toEqual([
      'code-beacon.enable',
      'code-beacon.disable',
      'code-beacon.toggle',
      'code-beacon.refresh',
      'code-beacon.scanWorkspace',
      'code-beacon.scanActiveFile',
      'code-beacon.scanOpenEditors',
      'code-beacon.focusExplorer',
      'code-beacon.reveal',
      'code-beacon.copyLink',
      'code-beacon.copyMarkdown',
      'code-beacon.exportMarkdown',
      'code-beacon.exportJson',
      'code-beacon.exportCsv',
      'code-beacon.openSettings',
      'code-beacon.clearCache',
    ])
  })

  it('declares configuration keys used by the MVP runtime', () => {
    const keys = Object.keys(pkg.contributes.configuration.properties)

    expect(keys).toEqual([
      'code-beacon.enable',
      'code-beacon.debug',
      'code-beacon.languages',
      'code-beacon.rules',
      'code-beacon.include',
      'code-beacon.exclude',
      'code-beacon.respectFilesExclude',
      'code-beacon.respectSearchExclude',
      'code-beacon.maxFileSize',
      'code-beacon.maxFilesForSearch',
      'code-beacon.scanMode',
      'code-beacon.commentOnly',
      'code-beacon.decorations.enabled',
      'code-beacon.diagnostics.mode',
      'code-beacon.explorer.enabled',
      'code-beacon.explorer.groupBy',
      'code-beacon.codelens.enabled',
      'code-beacon.hover.enabled',
      'code-beacon.export.defaultFormat',
    ])
  })

  it('declares the Code Beacon TreeView contribution', () => {
    expect(pkg.activationEvents).toContain('onView:codeBeacon.annotations')
    expect(pkg.contributes.viewsContainers?.activitybar).toEqual([
      {
        id: 'codeBeacon',
        title: 'Code Beacon',
        icon: './res/icon.png',
      },
    ])
    expect(pkg.contributes.views?.codeBeacon).toEqual([
      {
        id: 'codeBeacon.annotations',
        name: 'Beacons',
        when: 'code-beacon.explorer.enabled',
      },
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
rtk pnpm vitest tests/package-metadata.test.ts
```

Expected: FAIL because the new command/config/view metadata is not present.

- [ ] **Step 3: Modify `package.json` metadata**

Update these top-level fields in `package.json`:

```jsonc
{
  "description": "Highlight, list, diagnose, and export code annotations such as TODO, FIXME, BUG, NOTE, REVIEW, SECURITY, and PERF.",
  "categories": ["Other", "Linters", "Visualization"],
  "keywords": [
    "todo",
    "fixme",
    "annotation",
    "comments",
    "highlight",
    "tree view",
    "problems",
    "codelens",
    "vscode web",
    "github.dev",
    "code beacon",
  ],
  "extensionKind": ["ui", "workspace"],
}
```

Replace `contributes` with this complete MVP contribution object:

```jsonc
{
  "configuration": {
    "title": "Code Beacon",
    "properties": {
      "code-beacon.enable": {
        "type": "boolean",
        "default": true,
        "description": "Enable or disable Code Beacon.",
      },
      "code-beacon.debug": {
        "type": "boolean",
        "default": false,
        "description": "Enable debug logging.",
      },
      "code-beacon.languages": {
        "type": "array",
        "default": ["*"],
        "items": { "type": "string" },
        "description": "Language IDs where annotations are scanned. Use '*' for all languages and prefix with '!' to exclude.",
      },
      "code-beacon.rules": {
        "type": "array",
        "default": [],
        "description": "Custom annotation rules. Built-in rules are enabled unless a custom rule with the same id overrides them.",
        "items": {
          "type": "object",
          "required": ["id", "label", "category", "matcher", "severity"],
          "properties": {
            "id": { "type": "string" },
            "label": { "type": "string" },
            "category": {
              "type": "string",
              "enum": [
                "todo",
                "fixme",
                "bug",
                "hack",
                "note",
                "review",
                "security",
                "perf",
                "question",
                "custom",
              ],
            },
            "enabled": { "type": "boolean", "default": true },
            "matcher": {
              "type": "object",
              "required": ["type"],
              "properties": {
                "type": { "type": "string", "enum": ["text", "regex"] },
                "value": { "type": "string" },
                "pattern": { "type": "string" },
                "flags": { "type": "string" },
                "caseSensitive": { "type": "boolean" },
                "wholeWord": { "type": "boolean" },
                "colon": {
                  "type": "string",
                  "enum": ["required", "optional", "forbidden"],
                },
              },
            },
            "severity": {
              "type": "string",
              "enum": ["hint", "information", "warning", "error"],
            },
            "commentOnly": { "type": "boolean" },
            "languages": { "type": "array", "items": { "type": "string" } },
            "style": {
              "type": "object",
              "properties": {
                "marker": {
                  "type": "string",
                  "enum": ["keyword", "message", "line"],
                },
                "color": { "type": "string" },
                "backgroundColor": { "type": "string" },
                "border": { "type": "string" },
                "borderRadius": { "type": "string" },
                "overviewRulerColor": { "type": "string" },
              },
            },
            "diagnostics": {
              "type": "object",
              "properties": {
                "enabled": { "type": "boolean" },
                "severity": {
                  "type": "string",
                  "enum": ["hint", "information", "warning", "error"],
                },
              },
            },
          },
        },
      },
      "code-beacon.include": {
        "type": "array",
        "default": ["**/*"],
        "items": { "type": "string" },
        "scope": "resource",
        "description": "Glob patterns that define files to scan.",
      },
      "code-beacon.exclude": {
        "type": "array",
        "default": [
          "**/node_modules/**",
          "**/bower_components/**",
          "**/dist/**",
          "**/build/**",
          "**/.git/**",
          "**/.vscode/**",
          "**/.vscode-test/**",
          "**/.github/**",
          "**/.next/**",
          "**/coverage/**",
          "**/*.min.*",
          "**/*.map",
          "**/pnpm-lock.yaml",
          "**/package-lock.json",
          "**/yarn.lock",
        ],
        "items": { "type": "string" },
        "scope": "resource",
        "description": "Glob patterns that define files and folders to exclude from workspace scans.",
      },
      "code-beacon.respectFilesExclude": {
        "type": "boolean",
        "default": true,
        "description": "Respect VS Code files.exclude during workspace scans.",
      },
      "code-beacon.respectSearchExclude": {
        "type": "boolean",
        "default": true,
        "description": "Respect VS Code search.exclude during workspace scans.",
      },
      "code-beacon.maxFileSize": {
        "type": "number",
        "default": 1000000,
        "minimum": 0,
        "description": "Maximum document text length, in characters, to scan. Set to 0 to disable this size limit.",
      },
      "code-beacon.maxFilesForSearch": {
        "type": "number",
        "default": 5000,
        "minimum": 1,
        "description": "Maximum number of files to scan during workspace scans.",
      },
      "code-beacon.scanMode": {
        "type": "string",
        "default": "visibleEditors",
        "enum": ["visibleEditors", "openEditors", "workspace", "manual"],
        "description": "Default scan mode for Code Beacon.",
      },
      "code-beacon.commentOnly": {
        "type": "boolean",
        "default": true,
        "description": "Prefer scanning comments only when Code Beacon knows the language comment syntax.",
      },
      "code-beacon.decorations.enabled": {
        "type": "boolean",
        "default": true,
        "description": "Show editor decorations for annotations.",
      },
      "code-beacon.diagnostics.mode": {
        "type": "string",
        "default": "off",
        "enum": ["off", "openFiles", "workspace"],
        "description": "Controls Problems integration.",
      },
      "code-beacon.explorer.enabled": {
        "type": "boolean",
        "default": true,
        "description": "Enable the Code Beacon TreeView.",
      },
      "code-beacon.explorer.groupBy": {
        "type": "string",
        "default": "file",
        "enum": ["file", "rule", "category", "severity", "owner", "flat"],
        "description": "Default grouping mode for the Code Beacon TreeView.",
      },
      "code-beacon.codelens.enabled": {
        "type": "boolean",
        "default": false,
        "description": "Enable CodeLens actions above annotation lines.",
      },
      "code-beacon.hover.enabled": {
        "type": "boolean",
        "default": true,
        "description": "Enable hover details for annotations.",
      },
      "code-beacon.export.defaultFormat": {
        "type": "string",
        "default": "markdown",
        "enum": ["markdown", "json", "csv"],
        "description": "Default export format.",
      },
    },
  },
  "commands": [
    {
      "category": "Code Beacon",
      "command": "code-beacon.enable",
      "title": "Enable Code Beacon",
    },
    {
      "category": "Code Beacon",
      "command": "code-beacon.disable",
      "title": "Disable Code Beacon",
    },
    {
      "category": "Code Beacon",
      "command": "code-beacon.toggle",
      "title": "Toggle Code Beacon",
    },
    {
      "category": "Code Beacon",
      "command": "code-beacon.refresh",
      "title": "Refresh Beacons",
    },
    {
      "category": "Code Beacon",
      "command": "code-beacon.scanWorkspace",
      "title": "Scan Workspace for Beacons",
    },
    {
      "category": "Code Beacon",
      "command": "code-beacon.scanActiveFile",
      "title": "Scan Active File for Beacons",
    },
    {
      "category": "Code Beacon",
      "command": "code-beacon.scanOpenEditors",
      "title": "Scan Open Editors for Beacons",
    },
    {
      "category": "Code Beacon",
      "command": "code-beacon.focusExplorer",
      "title": "Focus Code Beacon Explorer",
    },
    {
      "category": "Code Beacon",
      "command": "code-beacon.reveal",
      "title": "Reveal Beacon",
    },
    {
      "category": "Code Beacon",
      "command": "code-beacon.copyLink",
      "title": "Copy Beacon Link",
    },
    {
      "category": "Code Beacon",
      "command": "code-beacon.copyMarkdown",
      "title": "Copy Beacon as Markdown",
    },
    {
      "category": "Code Beacon",
      "command": "code-beacon.exportMarkdown",
      "title": "Export Beacons as Markdown",
    },
    {
      "category": "Code Beacon",
      "command": "code-beacon.exportJson",
      "title": "Export Beacons as JSON",
    },
    {
      "category": "Code Beacon",
      "command": "code-beacon.exportCsv",
      "title": "Export Beacons as CSV",
    },
    {
      "category": "Code Beacon",
      "command": "code-beacon.openSettings",
      "title": "Open Code Beacon Settings",
    },
    {
      "category": "Code Beacon",
      "command": "code-beacon.clearCache",
      "title": "Clear Code Beacon Cache",
    },
  ],
  "viewsContainers": {
    "activitybar": [
      {
        "id": "codeBeacon",
        "title": "Code Beacon",
        "icon": "./res/icon.png",
      },
    ],
  },
  "views": {
    "codeBeacon": [
      {
        "id": "codeBeacon.annotations",
        "name": "Beacons",
        "when": "code-beacon.explorer.enabled",
      },
    ],
  },
  "menus": {
    "view/title": [
      {
        "command": "code-beacon.refresh",
        "when": "view == codeBeacon.annotations",
        "group": "navigation",
      },
      {
        "command": "code-beacon.scanWorkspace",
        "when": "view == codeBeacon.annotations",
        "group": "navigation",
      },
    ],
    "view/item/context": [
      {
        "command": "code-beacon.reveal",
        "when": "view == codeBeacon.annotations && viewItem == beacon",
        "group": "inline",
      },
      {
        "command": "code-beacon.copyLink",
        "when": "view == codeBeacon.annotations && viewItem == beacon",
        "group": "inline",
      },
    ],
  },
}
```

Update activation and capabilities:

```jsonc
{
  "activationEvents": ["onStartupFinished"],
  "capabilities": {
    "untrustedWorkspaces": {
      "supported": "limited",
      "restrictedConfigurations": [],
    },
    "virtualWorkspaces": {
      "supported": true,
    },
  },
}
```

- [ ] **Step 4: Regenerate meta**

Run:

```bash
rtk pnpm generate:meta
```

Expected: `src/meta.ts` contains every new `code-beacon.*` command and config key.

- [ ] **Step 5: Run metadata test**

Run:

```bash
rtk pnpm vitest tests/package-metadata.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
rtk pnpm format:check
rtk pnpm lint
pnpm typecheck
rtk git add package.json src/meta.ts tests/package-metadata.test.ts README.md
rtk git commit -m "feat: declare Code Beacon MVP contributions"
```

Expected: commit succeeds.

## Task 2: Domain Types, Default Rules, and Rule Normalization

**Files:**

- Create: `src/types/annotation.ts`
- Create: `src/constants/defaults.ts`
- Create: `src/core/rules/normalize.ts`
- Create: `tests/rules.test.ts`

**Interfaces:**

- Produces type `BeaconRuleConfig`, `BeaconRule`, `CompiledBeaconRule`, `BeaconAnnotation`, `BeaconSeverity`, `BeaconCategory`, `SerializedRange`.
- Produces function `normalizeRules(customRules: readonly BeaconRuleConfig[]): NormalizedRuleResult`.
- Later scanner tasks consume `CompiledBeaconRule.matcherRegex`, `CompiledBeaconRule.messageMode`, and `CompiledBeaconRule.style`.

- [ ] **Step 1: Write failing tests**

Create `tests/rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_BEACON_RULES } from '../src/constants/defaults'
import { normalizeRules } from '../src/core/rules/normalize'
import type { BeaconRuleConfig } from '../src/types/annotation'

describe('normalizeRules', () => {
  it('returns enabled built-in rules when no custom rules are provided', () => {
    const result = normalizeRules([])

    expect(result.errors).toEqual([])
    expect(result.rules.map(rule => rule.id)).toEqual(
      DEFAULT_BEACON_RULES.map(rule => rule.id),
    )
    expect(
      result.rules.find(rule => rule.id === 'todo')?.matcherRegex.source,
    ).toBe('\\bTODO:?')
  })

  it('overrides a built-in rule by id', () => {
    const customRules: BeaconRuleConfig[] = [
      {
        id: 'todo',
        label: 'Work Item',
        category: 'todo',
        enabled: true,
        matcher: {
          type: 'text',
          value: 'WORK',
          wholeWord: true,
          colon: 'optional',
          caseSensitive: false,
        },
        severity: 'warning',
      },
    ]

    const result = normalizeRules(customRules)

    expect(result.errors).toEqual([])
    expect(result.rules.find(rule => rule.id === 'todo')).toMatchObject({
      id: 'todo',
      label: 'Work Item',
      severity: 'warning',
    })
    expect(
      result.rules.find(rule => rule.id === 'todo')?.matcherRegex.source,
    ).toBe('\\bWORK:?')
  })

  it('reports invalid regex rules without throwing', () => {
    const result = normalizeRules([
      {
        id: 'broken',
        label: 'Broken',
        category: 'custom',
        enabled: true,
        matcher: {
          type: 'regex',
          pattern: '(',
        },
        severity: 'information',
      },
    ])

    expect(result.rules.some(rule => rule.id === 'broken')).toBe(false)
    expect(result.errors).toEqual([
      {
        ruleId: 'broken',
        message: 'Invalid regular expression for rule "broken": (',
      },
    ])
  })

  it('drops disabled custom rules', () => {
    const result = normalizeRules([
      {
        id: 'skip',
        label: 'Skip',
        category: 'custom',
        enabled: false,
        matcher: {
          type: 'text',
          value: 'SKIP',
        },
        severity: 'hint',
      },
    ])

    expect(result.rules.some(rule => rule.id === 'skip')).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
rtk pnpm vitest tests/rules.test.ts
```

Expected: FAIL because `src/types/annotation.ts`, `src/constants/defaults.ts`, and `src/core/rules/normalize.ts` do not exist.

- [ ] **Step 3: Create domain types**

Create `src/types/annotation.ts`:

```ts
export type BeaconCategory =
  | 'todo'
  | 'fixme'
  | 'bug'
  | 'hack'
  | 'note'
  | 'review'
  | 'security'
  | 'perf'
  | 'question'
  | 'custom'

export type BeaconSeverity = 'hint' | 'information' | 'warning' | 'error'

export type BeaconMarker = 'keyword' | 'message' | 'line'

export interface SerializedPosition {
  readonly line: number
  readonly character: number
}

export interface SerializedRange {
  readonly start: SerializedPosition
  readonly end: SerializedPosition
}

export interface BeaconTextMatcherConfig {
  readonly type: 'text'
  readonly value: string
  readonly caseSensitive?: boolean
  readonly wholeWord?: boolean
  readonly colon?: 'required' | 'optional' | 'forbidden'
}

export interface BeaconRegexMatcherConfig {
  readonly type: 'regex'
  readonly pattern: string
  readonly flags?: string
}

export type BeaconMatcherConfig =
  BeaconTextMatcherConfig | BeaconRegexMatcherConfig

export interface BeaconStyleConfig {
  readonly marker?: BeaconMarker
  readonly color?: string
  readonly backgroundColor?: string
  readonly border?: string
  readonly borderRadius?: string
  readonly overviewRulerColor?: string
}

export interface BeaconDiagnosticsConfig {
  readonly enabled?: boolean
  readonly severity?: BeaconSeverity
}

export interface BeaconMessageConfig {
  readonly mode?: 'lineRest' | 'match' | 'group'
  readonly group?: string
  readonly trim?: boolean
}

export interface BeaconRuleConfig {
  readonly id: string
  readonly label: string
  readonly category: BeaconCategory
  readonly enabled?: boolean
  readonly matcher: BeaconMatcherConfig
  readonly message?: BeaconMessageConfig
  readonly severity: BeaconSeverity
  readonly commentOnly?: boolean
  readonly languages?: readonly string[]
  readonly style?: BeaconStyleConfig
  readonly diagnostics?: BeaconDiagnosticsConfig
}

export interface CompiledBeaconRule extends BeaconRuleConfig {
  readonly enabled: true
  readonly matcherRegex: RegExp
  readonly caseSensitive: boolean
  readonly messageMode: Required<BeaconMessageConfig>
  readonly style: Required<BeaconStyleConfig>
}

export interface BeaconRuleError {
  readonly ruleId: string
  readonly message: string
}

export interface NormalizedRuleResult {
  readonly rules: readonly CompiledBeaconRule[]
  readonly errors: readonly BeaconRuleError[]
}

export interface BeaconAnnotation {
  readonly id: string
  readonly ruleId: string
  readonly category: BeaconCategory
  readonly severity: BeaconSeverity
  readonly uri: string
  readonly languageId: string
  readonly range: SerializedRange
  readonly keywordRange: SerializedRange
  readonly messageRange?: SerializedRange
  readonly line: number
  readonly column: number
  readonly keyword: string
  readonly message: string
  readonly source: 'visibleEditor' | 'openEditor' | 'workspace' | 'notebook'
}
```

- [ ] **Step 4: Create default rules**

Create `src/constants/defaults.ts`:

```ts
import type { BeaconRuleConfig, BeaconStyleConfig } from '../types/annotation'

export const DEFAULT_INCLUDE = ['**/*'] as const

export const DEFAULT_EXCLUDE = [
  '**/node_modules/**',
  '**/bower_components/**',
  '**/dist/**',
  '**/build/**',
  '**/.git/**',
  '**/.vscode/**',
  '**/.vscode-test/**',
  '**/.github/**',
  '**/.next/**',
  '**/coverage/**',
  '**/*.min.*',
  '**/*.map',
  '**/pnpm-lock.yaml',
  '**/package-lock.json',
  '**/yarn.lock',
] as const

export const DEFAULT_STYLE: Required<BeaconStyleConfig> = {
  marker: 'keyword',
  color: '#ffffff',
  backgroundColor: '#6f42c1',
  border: '1px solid transparent',
  borderRadius: '3px',
  overviewRulerColor: '#6f42c1',
}

export const DEFAULT_BEACON_RULES: readonly BeaconRuleConfig[] = [
  {
    id: 'todo',
    label: 'TODO',
    category: 'todo',
    enabled: true,
    matcher: {
      type: 'text',
      value: 'TODO',
      wholeWord: true,
      colon: 'optional',
      caseSensitive: false,
    },
    severity: 'information',
    commentOnly: true,
    style: {
      backgroundColor: '#9a6700',
      overviewRulerColor: '#9a6700',
    },
  },
  {
    id: 'fixme',
    label: 'FIXME',
    category: 'fixme',
    enabled: true,
    matcher: {
      type: 'text',
      value: 'FIXME',
      wholeWord: true,
      colon: 'optional',
      caseSensitive: false,
    },
    severity: 'warning',
    commentOnly: true,
    style: {
      backgroundColor: '#cf222e',
      overviewRulerColor: '#cf222e',
    },
  },
  {
    id: 'bug',
    label: 'BUG',
    category: 'bug',
    enabled: true,
    matcher: {
      type: 'text',
      value: 'BUG',
      wholeWord: true,
      colon: 'optional',
      caseSensitive: false,
    },
    severity: 'error',
    commentOnly: true,
    style: {
      backgroundColor: '#a40e26',
      overviewRulerColor: '#a40e26',
    },
  },
  {
    id: 'hack',
    label: 'HACK',
    category: 'hack',
    enabled: true,
    matcher: {
      type: 'text',
      value: 'HACK',
      wholeWord: true,
      colon: 'optional',
      caseSensitive: false,
    },
    severity: 'warning',
    commentOnly: true,
  },
  {
    id: 'note',
    label: 'NOTE',
    category: 'note',
    enabled: true,
    matcher: {
      type: 'text',
      value: 'NOTE',
      wholeWord: true,
      colon: 'optional',
      caseSensitive: false,
    },
    severity: 'hint',
    commentOnly: true,
    style: {
      backgroundColor: '#0969da',
      overviewRulerColor: '#0969da',
    },
  },
  {
    id: 'review',
    label: 'REVIEW',
    category: 'review',
    enabled: true,
    matcher: {
      type: 'text',
      value: 'REVIEW',
      wholeWord: true,
      colon: 'optional',
      caseSensitive: false,
    },
    severity: 'information',
    commentOnly: true,
  },
  {
    id: 'security',
    label: 'SECURITY',
    category: 'security',
    enabled: true,
    matcher: {
      type: 'text',
      value: 'SECURITY',
      wholeWord: true,
      colon: 'optional',
      caseSensitive: false,
    },
    severity: 'error',
    commentOnly: true,
    style: {
      backgroundColor: '#d1242f',
      overviewRulerColor: '#d1242f',
    },
  },
  {
    id: 'perf',
    label: 'PERF',
    category: 'perf',
    enabled: true,
    matcher: {
      type: 'regex',
      pattern: '\\b(?:PERF|OPTIMIZE):?',
      flags: 'i',
    },
    severity: 'warning',
    commentOnly: true,
  },
  {
    id: 'question',
    label: 'QUESTION',
    category: 'question',
    enabled: true,
    matcher: {
      type: 'regex',
      pattern: '\\b(?:QUESTION|ASK|Q):?',
      flags: 'i',
    },
    severity: 'information',
    commentOnly: true,
  },
]
```

- [ ] **Step 5: Implement normalization**

Create `src/core/rules/normalize.ts`:

```ts
import { DEFAULT_BEACON_RULES, DEFAULT_STYLE } from '../../constants/defaults'
import type {
  BeaconMessageConfig,
  BeaconRuleConfig,
  CompiledBeaconRule,
  NormalizedRuleResult,
} from '../../types/annotation'

const DEFAULT_MESSAGE_MODE: Required<BeaconMessageConfig> = {
  mode: 'lineRest',
  group: 'message',
  trim: true,
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildTextPattern(rule: BeaconRuleConfig): string {
  if (rule.matcher.type !== 'text') {
    throw new Error('Expected text matcher')
  }

  const escaped = escapeRegExp(rule.matcher.value)
  const prefix = (rule.matcher.wholeWord ?? true) ? '\\b' : ''

  if (rule.matcher.colon === 'required') {
    return `${prefix}${escaped}:`
  }

  if (rule.matcher.colon === 'forbidden') {
    return `${prefix}${escaped}`
  }

  return `${prefix}${escaped}:?`
}

function compileRule(rule: BeaconRuleConfig): CompiledBeaconRule {
  const flags =
    rule.matcher.type === 'regex'
      ? rule.matcher.flags
      : rule.matcher.caseSensitive
        ? 'g'
        : 'gi'
  const source =
    rule.matcher.type === 'regex'
      ? rule.matcher.pattern
      : buildTextPattern(rule)
  const matcherRegex = new RegExp(
    source,
    flags?.includes('g') ? flags : `${flags ?? ''}g`,
  )

  return {
    ...rule,
    enabled: true,
    matcherRegex,
    caseSensitive:
      rule.matcher.type === 'text'
        ? (rule.matcher.caseSensitive ?? false)
        : !matcherRegex.ignoreCase,
    messageMode: {
      ...DEFAULT_MESSAGE_MODE,
      ...rule.message,
    },
    style: {
      ...DEFAULT_STYLE,
      ...rule.style,
    },
  }
}

export function normalizeRules(
  customRules: readonly BeaconRuleConfig[],
): NormalizedRuleResult {
  const mergedRules = new Map<string, BeaconRuleConfig>()
  const errors: NormalizedRuleResult['errors'] = []

  for (const rule of DEFAULT_BEACON_RULES) {
    mergedRules.set(rule.id, rule)
  }

  for (const rule of customRules) {
    mergedRules.set(rule.id, rule)
  }

  const rules: CompiledBeaconRule[] = []

  for (const rule of mergedRules.values()) {
    if (rule.enabled === false) {
      continue
    }

    try {
      rules.push(compileRule(rule))
    } catch {
      errors.push({
        ruleId: rule.id,
        message: `Invalid regular expression for rule "${rule.id}": ${
          rule.matcher.type === 'regex'
            ? rule.matcher.pattern
            : rule.matcher.value
        }`,
      })
    }
  }

  return { rules, errors }
}
```

- [ ] **Step 6: Run tests**

Run:

```bash
rtk pnpm vitest tests/rules.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
rtk pnpm format:check
rtk pnpm lint
pnpm typecheck
rtk git add src/types/annotation.ts src/constants/defaults.ts src/core/rules/normalize.ts tests/rules.test.ts
rtk git commit -m "feat: add beacon rule model"
```

Expected: commit succeeds.

## Task 3: Matchers, Comment Ranges, and Pure Document Scanning

**Files:**

- Create: `src/core/scanner/comment-ranges.ts`
- Create: `src/core/scanner/scan-document.ts`
- Create: `tests/comment-ranges.test.ts`
- Create: `tests/scan-document.test.ts`

**Interfaces:**

- Consumes: `CompiledBeaconRule`, `BeaconAnnotation`, `SerializedRange` from Task 2.
- Produces function `getCommentRanges(text: string, languageId: string): readonly OffsetRange[]`.
- Produces function `scanDocument(options: ScanDocumentOptions): BeaconScanResult`.
- Later highlighter, TreeView, diagnostics, export, and workspace scan consume `scanDocument`.

- [ ] **Step 1: Write comment range tests**

Create `tests/comment-ranges.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { getCommentRanges } from '../src/core/scanner/comment-ranges'

describe('getCommentRanges', () => {
  it('finds TypeScript line and block comments', () => {
    const text = [
      'const value = "TODO: not a comment"',
      '// TODO: line comment',
      'const next = 1',
      '/* FIXME: block comment */',
    ].join('\n')

    const ranges = getCommentRanges(text, 'typescript')
    const comments = ranges.map(range => text.slice(range.start, range.end))

    expect(comments).toEqual([
      '// TODO: line comment',
      '/* FIXME: block comment */',
    ])
  })

  it('finds Python comments', () => {
    const text = 'value = "TODO: not a comment"\n# TODO: python comment'

    const ranges = getCommentRanges(text, 'python')

    expect(ranges.map(range => text.slice(range.start, range.end))).toEqual([
      '# TODO: python comment',
    ])
  })

  it('falls back to the whole document for unknown languages', () => {
    const text = 'TODO: fallback'

    expect(getCommentRanges(text, 'unknown-language')).toEqual([
      {
        start: 0,
        end: text.length,
        fallback: true,
      },
    ])
  })
})
```

- [ ] **Step 2: Write scan tests**

Create `tests/scan-document.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { normalizeRules } from '../src/core/rules/normalize'
import { scanDocument } from '../src/core/scanner/scan-document'

const rules = normalizeRules([]).rules

describe('scanDocument', () => {
  it('scans comments and ignores string literals by default', () => {
    const result = scanDocument({
      text: [
        'const value = "TODO: not a comment"',
        '// TODO: write the scanner',
        '// FIXME(owner): handle old entries',
      ].join('\n'),
      languageId: 'typescript',
      uri: 'file:///workspace/src/example.ts',
      source: 'visibleEditor',
      rules,
      commentOnly: true,
      maxFileSize: 1_000_000,
    })

    expect(result.skipped).toBeUndefined()
    expect(result.annotations).toHaveLength(2)
    expect(result.annotations.map(annotation => annotation.keyword)).toEqual([
      'TODO:',
      'FIXME',
    ])
    expect(result.annotations.map(annotation => annotation.message)).toEqual([
      'write the scanner',
      '(owner): handle old entries',
    ])
  })

  it('skips files above the configured size limit', () => {
    const result = scanDocument({
      text: 'TODO: too large',
      languageId: 'typescript',
      uri: 'file:///workspace/src/large.ts',
      source: 'visibleEditor',
      rules,
      commentOnly: true,
      maxFileSize: 4,
    })

    expect(result.annotations).toEqual([])
    expect(result.skipped).toEqual({
      reason: 'maxFileSize',
      message: 'File length 15 exceeds configured maxFileSize 4',
    })
  })
})
```

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
rtk pnpm vitest tests/comment-ranges.test.ts tests/scan-document.test.ts
```

Expected: FAIL because scanner files do not exist.

- [ ] **Step 4: Implement comment ranges**

Create `src/core/scanner/comment-ranges.ts`:

```ts
export interface OffsetRange {
  readonly start: number
  readonly end: number
  readonly fallback?: boolean
}

interface CommentSyntax {
  readonly line?: readonly string[]
  readonly block?: readonly [string, string][]
}

const COMMENT_SYNTAX: Record<string, CommentSyntax> = {
  javascript: { line: ['//'], block: [['/*', '*/']] },
  javascriptreact: { line: ['//'], block: [['/*', '*/']] },
  typescript: { line: ['//'], block: [['/*', '*/']] },
  typescriptreact: { line: ['//'], block: [['/*', '*/']] },
  css: { block: [['/*', '*/']] },
  scss: { line: ['//'], block: [['/*', '*/']] },
  less: { line: ['//'], block: [['/*', '*/']] },
  html: { block: [['<!--', '-->']] },
  markdown: { block: [['<!--', '-->']] },
  python: { line: ['#'] },
  ruby: { line: ['#'] },
  shellscript: { line: ['#'] },
  yaml: { line: ['#'] },
  toml: { line: ['#'] },
  go: { line: ['//'], block: [['/*', '*/']] },
  rust: { line: ['//'], block: [['/*', '*/']] },
  java: { line: ['//'], block: [['/*', '*/']] },
  c: { line: ['//'], block: [['/*', '*/']] },
  cpp: { line: ['//'], block: [['/*', '*/']] },
}

function findLineCommentRanges(
  text: string,
  tokens: readonly string[],
): OffsetRange[] {
  const ranges: OffsetRange[] = []
  let lineStart = 0

  while (lineStart <= text.length) {
    const lineEndIndex = text.indexOf('\n', lineStart)
    const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex
    const line = text.slice(lineStart, lineEnd)
    const tokenIndex = tokens
      .map(token => line.indexOf(token))
      .filter(index => index >= 0)
      .sort((a, b) => a - b)[0]

    if (tokenIndex !== undefined) {
      ranges.push({
        start: lineStart + tokenIndex,
        end: lineEnd,
      })
    }

    if (lineEndIndex === -1) {
      break
    }
    lineStart = lineEnd + 1
  }

  return ranges
}

function findBlockCommentRanges(
  text: string,
  pairs: readonly [string, string][],
): OffsetRange[] {
  const ranges: OffsetRange[] = []

  for (const [open, close] of pairs) {
    let searchFrom = 0
    while (searchFrom < text.length) {
      const start = text.indexOf(open, searchFrom)
      if (start === -1) {
        break
      }

      const closeStart = text.indexOf(close, start + open.length)
      const end = closeStart === -1 ? text.length : closeStart + close.length
      ranges.push({ start, end })
      searchFrom = end
    }
  }

  return ranges
}

export function getCommentRanges(
  text: string,
  languageId: string,
): readonly OffsetRange[] {
  const syntax = COMMENT_SYNTAX[languageId]

  if (!syntax) {
    return [{ start: 0, end: text.length, fallback: true }]
  }

  return [
    ...(syntax.line ? findLineCommentRanges(text, syntax.line) : []),
    ...(syntax.block ? findBlockCommentRanges(text, syntax.block) : []),
  ].sort((a, b) => a.start - b.start)
}
```

- [ ] **Step 5: Implement document scanner**

Create `src/core/scanner/scan-document.ts`:

```ts
import { getCommentRanges } from './comment-ranges'
import type { OffsetRange } from './comment-ranges'
import type {
  BeaconAnnotation,
  CompiledBeaconRule,
  SerializedPosition,
  SerializedRange,
} from '../../types/annotation'

export interface BeaconSkipReason {
  readonly reason: 'maxFileSize'
  readonly message: string
}

export interface BeaconScanResult {
  readonly uri: string
  readonly languageId: string
  readonly annotations: readonly BeaconAnnotation[]
  readonly skipped?: BeaconSkipReason
  readonly durationMs: number
}

export interface ScanDocumentOptions {
  readonly text: string
  readonly languageId: string
  readonly uri: string
  readonly source: BeaconAnnotation['source']
  readonly rules: readonly CompiledBeaconRule[]
  readonly commentOnly: boolean
  readonly maxFileSize: number
}

function positionAt(text: string, offset: number): SerializedPosition {
  const before = text.slice(0, offset)
  const line = before.split('\n').length - 1
  const lastNewline = before.lastIndexOf('\n')

  return {
    line,
    character: lastNewline === -1 ? offset : offset - lastNewline - 1,
  }
}

function rangeAt(text: string, start: number, end: number): SerializedRange {
  return {
    start: positionAt(text, start),
    end: positionAt(text, end),
  }
}

function lineEndAt(text: string, offset: number): number {
  const newline = text.indexOf('\n', offset)
  return newline === -1 ? text.length : newline
}

function extractMessage(
  text: string,
  matchEnd: number,
  rule: CompiledBeaconRule,
): string {
  if (rule.messageMode.mode === 'match') {
    return ''
  }

  const value = text.slice(matchEnd, lineEndAt(text, matchEnd))
  return rule.messageMode.trim ? value.replace(/^[:\s-]+/, '').trim() : value
}

function annotationId(
  uri: string,
  ruleId: string,
  start: number,
  keyword: string,
): string {
  return `${uri}:${ruleId}:${start}:${keyword}`
}

function scanRange(
  text: string,
  range: OffsetRange,
  options: ScanDocumentOptions,
): BeaconAnnotation[] {
  const annotations: BeaconAnnotation[] = []
  const segment = text.slice(range.start, range.end)

  for (const rule of options.rules) {
    rule.matcherRegex.lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = rule.matcherRegex.exec(segment))) {
      const start = range.start + match.index
      const keyword = match[0]
      const end = start + keyword.length
      const message = extractMessage(text, end, rule)
      const keywordRange = rangeAt(text, start, end)
      const messageEnd = lineEndAt(text, end)
      const messageRange = rangeAt(text, end, messageEnd)

      annotations.push({
        id: annotationId(options.uri, rule.id, start, keyword),
        ruleId: rule.id,
        category: rule.category,
        severity: rule.severity,
        uri: options.uri,
        languageId: options.languageId,
        range:
          rule.style.marker === 'line'
            ? rangeAt(text, start, messageEnd)
            : keywordRange,
        keywordRange,
        messageRange,
        line: keywordRange.start.line,
        column: keywordRange.start.character,
        keyword,
        message,
        source: options.source,
      })
    }
  }

  return annotations
}

export function scanDocument(options: ScanDocumentOptions): BeaconScanResult {
  const startedAt = Date.now()

  if (options.maxFileSize > 0 && options.text.length > options.maxFileSize) {
    return {
      uri: options.uri,
      languageId: options.languageId,
      annotations: [],
      skipped: {
        reason: 'maxFileSize',
        message: `File length ${options.text.length} exceeds configured maxFileSize ${options.maxFileSize}`,
      },
      durationMs: Date.now() - startedAt,
    }
  }

  const ranges = options.commentOnly
    ? getCommentRanges(options.text, options.languageId)
    : [{ start: 0, end: options.text.length }]

  return {
    uri: options.uri,
    languageId: options.languageId,
    annotations: ranges.flatMap(range =>
      scanRange(options.text, range, options),
    ),
    durationMs: Date.now() - startedAt,
  }
}
```

- [ ] **Step 6: Run scanner tests**

Run:

```bash
rtk pnpm vitest tests/comment-ranges.test.ts tests/scan-document.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
rtk pnpm format:check
rtk pnpm lint
pnpm typecheck
rtk git add src/core/scanner/comment-ranges.ts src/core/scanner/scan-document.ts tests/comment-ranges.test.ts tests/scan-document.test.ts
rtk git commit -m "feat: scan beacon annotations"
```

Expected: commit succeeds.

## Task 4: Annotation Store and Range Utilities

**Files:**

- Create: `src/core/store/annotation-store.ts`
- Create: `src/utils/ranges.ts`
- Create: `tests/annotation-store.test.ts`

**Interfaces:**

- Consumes: `BeaconAnnotation` from Task 2.
- Produces singleton `annotationStore`.
- Produces methods: `setForUri(uri: string, annotations: readonly BeaconAnnotation[]): void`, `getAll(): readonly BeaconAnnotation[]`, `getForUri(uri: string): readonly BeaconAnnotation[]`, `clear(): void`, `subscribe(listener: AnnotationStoreListener): () => void`.
- Produces utility `formatBeaconLink(annotation: BeaconAnnotation): string`.

- [ ] **Step 1: Write failing store tests**

Create `tests/annotation-store.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createAnnotationStore } from '../src/core/store/annotation-store'
import { formatBeaconLink } from '../src/utils/ranges'
import type { BeaconAnnotation } from '../src/types/annotation'

function createAnnotation(
  id: string,
  uri = 'file:///workspace/src/a.ts',
): BeaconAnnotation {
  return {
    id,
    ruleId: 'todo',
    category: 'todo',
    severity: 'information',
    uri,
    languageId: 'typescript',
    range: {
      start: { line: 1, character: 3 },
      end: { line: 1, character: 8 },
    },
    keywordRange: {
      start: { line: 1, character: 3 },
      end: { line: 1, character: 8 },
    },
    line: 1,
    column: 3,
    keyword: 'TODO:',
    message: 'ship it',
    source: 'visibleEditor',
  }
}

describe('annotation store', () => {
  it('stores annotations by URI and notifies subscribers', () => {
    const store = createAnnotationStore()
    const listener = vi.fn()
    const dispose = store.subscribe(listener)

    store.setForUri('file:///workspace/src/a.ts', [createAnnotation('a')])

    expect(store.getForUri('file:///workspace/src/a.ts')).toHaveLength(1)
    expect(store.getAll().map(annotation => annotation.id)).toEqual(['a'])
    expect(listener).toHaveBeenCalledTimes(1)

    dispose()
    store.setForUri('file:///workspace/src/a.ts', [])
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('clears all annotations', () => {
    const store = createAnnotationStore()
    store.setForUri('file:///workspace/src/a.ts', [createAnnotation('a')])
    store.setForUri('file:///workspace/src/b.ts', [
      createAnnotation('b', 'file:///workspace/src/b.ts'),
    ])

    store.clear()

    expect(store.getAll()).toEqual([])
  })

  it('formats file links with one-based line and column numbers', () => {
    expect(formatBeaconLink(createAnnotation('a'))).toBe(
      'file:///workspace/src/a.ts:2:4',
    )
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
rtk pnpm vitest tests/annotation-store.test.ts
```

Expected: FAIL because store and range utilities do not exist.

- [ ] **Step 3: Implement store**

Create `src/core/store/annotation-store.ts`:

```ts
import type { BeaconAnnotation } from '../../types/annotation'

export type AnnotationStoreListener = () => void

export interface AnnotationStore {
  setForUri(uri: string, annotations: readonly BeaconAnnotation[]): void
  getForUri(uri: string): readonly BeaconAnnotation[]
  getAll(): readonly BeaconAnnotation[]
  clear(): void
  subscribe(listener: AnnotationStoreListener): () => void
}

export function createAnnotationStore(): AnnotationStore {
  const byUri = new Map<string, readonly BeaconAnnotation[]>()
  const listeners = new Set<AnnotationStoreListener>()

  const notify = () => {
    for (const listener of listeners) {
      listener()
    }
  }

  return {
    setForUri(uri, annotations) {
      byUri.set(uri, [...annotations])
      notify()
    },
    getForUri(uri) {
      return [...(byUri.get(uri) ?? [])]
    },
    getAll() {
      return [...byUri.values()].flat()
    },
    clear() {
      byUri.clear()
      notify()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export const annotationStore = createAnnotationStore()
```

- [ ] **Step 4: Implement range utility**

Create `src/utils/ranges.ts`:

```ts
import type { Range } from 'vscode'
import { Range as VscodeRange } from 'vscode'
import type { BeaconAnnotation, SerializedRange } from '../types/annotation'

export function toVscodeRange(range: SerializedRange): Range {
  return new VscodeRange(
    range.start.line,
    range.start.character,
    range.end.line,
    range.end.character,
  )
}

export function formatBeaconLink(annotation: BeaconAnnotation): string {
  return `${annotation.uri}:${annotation.line + 1}:${annotation.column + 1}`
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
rtk pnpm vitest tests/annotation-store.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
rtk pnpm format:check
rtk pnpm lint
pnpm typecheck
rtk git add src/core/store/annotation-store.ts src/utils/ranges.ts tests/annotation-store.test.ts
rtk git commit -m "feat: add annotation store"
```

Expected: commit succeeds.

## Task 5: Editor Decorations and Visible Editor Scanning

**Files:**

- Create: `src/utils/editor-filter.ts`
- Create: `src/decorations/decoration-type-cache.ts`
- Create: `src/decorations/apply-decorations.ts`
- Create: `src/composables/use-beacon-highlight.ts`
- Modify: `src/index.ts`
- Create: `tests/decoration-type-cache.test.ts`

**Interfaces:**

- Consumes: `normalizeRules`, `scanDocument`, `annotationStore`, `toVscodeRange`.
- Produces composable `useBeaconHighlight(): void`.
- Later commands and providers can rely on `annotationStore` being updated for visible editors.

- [ ] **Step 1: Write decoration cache test**

Create `tests/decoration-type-cache.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import type * as Vscode from 'vscode'

const dispose = vi.fn()
const createTextEditorDecorationType = vi.fn(() => ({ dispose }))

vi.mock(
  import('vscode'),
  () =>
    ({
      OverviewRulerLane: { Right: 4 },
      window: { createTextEditorDecorationType },
    }) as unknown as Partial<typeof Vscode>,
)

describe('DecorationTypeCache', () => {
  it('reuses decoration types by stable style key and disposes stale entries', async () => {
    const { DecorationTypeCache } =
      await import('../src/decorations/decoration-type-cache')
    const cache = new DecorationTypeCache()

    const first = cache.getOrCreate('todo', {
      marker: 'keyword',
      color: '#fff',
      backgroundColor: '#000',
      border: '1px solid #000',
      borderRadius: '3px',
      overviewRulerColor: '#000',
    })
    const second = cache.getOrCreate('todo', {
      marker: 'keyword',
      color: '#fff',
      backgroundColor: '#000',
      border: '1px solid #000',
      borderRadius: '3px',
      overviewRulerColor: '#000',
    })

    expect(first).toBe(second)
    expect(createTextEditorDecorationType).toHaveBeenCalledTimes(1)

    cache.disposeStale(['missing'])
    expect(dispose).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
rtk pnpm vitest tests/decoration-type-cache.test.ts
```

Expected: FAIL because decoration files do not exist.

- [ ] **Step 3: Implement editor filter**

Create `src/utils/editor-filter.ts`:

```ts
import type { TextDocument, TextEditor } from 'vscode'

const EXCLUDED_SCHEME_KEYWORDS = [
  'output',
  'debug',
  'terminal',
  'search',
  'git',
] as const

export function shouldTrackDocument(
  document: Pick<TextDocument, 'uri'>,
): boolean {
  const scheme = document.uri.scheme.toLowerCase()
  return !EXCLUDED_SCHEME_KEYWORDS.some(keyword => scheme.includes(keyword))
}

export function shouldTrackEditor(
  editor: Pick<TextEditor, 'document'>,
): boolean {
  return shouldTrackDocument(editor.document)
}
```

- [ ] **Step 4: Implement decoration cache**

Create `src/decorations/decoration-type-cache.ts`:

```ts
import { OverviewRulerLane, window } from 'vscode'
import type { TextEditorDecorationType } from 'vscode'
import type { BeaconStyleConfig } from '../types/annotation'

function createKey(ruleId: string, style: Required<BeaconStyleConfig>): string {
  return JSON.stringify({ ruleId, style })
}

export class DecorationTypeCache {
  private readonly cache = new Map<string, TextEditorDecorationType>()

  public getOrCreate(
    ruleId: string,
    style: Required<BeaconStyleConfig>,
  ): TextEditorDecorationType {
    const key = createKey(ruleId, style)
    const existing = this.cache.get(key)
    if (existing) {
      return existing
    }

    const decorationType = window.createTextEditorDecorationType({
      backgroundColor: style.backgroundColor,
      border: style.border,
      borderRadius: style.borderRadius,
      color: style.color,
      isWholeLine: style.marker === 'line',
      overviewRulerColor: style.overviewRulerColor,
      overviewRulerLane: OverviewRulerLane.Right,
    })
    this.cache.set(key, decorationType)
    return decorationType
  }

  public getAll(): readonly TextEditorDecorationType[] {
    return [...this.cache.values()]
  }

  public disposeStale(activeKeys: readonly string[]) {
    const active = new Set(activeKeys)
    for (const [key, decorationType] of this.cache) {
      if (active.has(key)) {
        continue
      }
      decorationType.dispose()
      this.cache.delete(key)
    }
  }

  public clear() {
    for (const decorationType of this.cache.values()) {
      decorationType.dispose()
    }
    this.cache.clear()
  }
}
```

- [ ] **Step 5: Implement decoration application**

Create `src/decorations/apply-decorations.ts`:

```ts
import type { TextEditor } from 'vscode'
import type { DecorationTypeCache } from './decoration-type-cache'
import type { BeaconAnnotation, CompiledBeaconRule } from '../types/annotation'
import { toVscodeRange } from '../utils/ranges'

export function applyBeaconDecorations(
  editor: TextEditor,
  cache: DecorationTypeCache,
  annotations: readonly BeaconAnnotation[],
  rules: readonly CompiledBeaconRule[],
) {
  const rulesById = new Map(rules.map(rule => [rule.id, rule]))
  const activeKeys: string[] = []

  for (const decorationType of cache.getAll()) {
    editor.setDecorations(decorationType, [])
  }

  for (const rule of rules) {
    const ranges = annotations
      .filter(annotation => annotation.ruleId === rule.id)
      .map(annotation => toVscodeRange(annotation.range))

    if (ranges.length === 0 || !rulesById.has(rule.id)) {
      continue
    }

    const decorationType = cache.getOrCreate(rule.id, rule.style)
    activeKeys.push(JSON.stringify({ ruleId: rule.id, style: rule.style }))
    editor.setDecorations(decorationType, ranges)
  }

  cache.disposeStale(activeKeys)
}
```

- [ ] **Step 6: Implement visible editor composable**

Create `src/composables/use-beacon-highlight.ts`:

```ts
import {
  onDeactivate,
  ref,
  useDocumentText,
  useVisibleTextEditors,
  watch,
} from 'reactive-vscode'
import type { Ref } from 'reactive-vscode'
import type { TextEditor } from 'vscode'
import { config } from '../config'
import { normalizeRules } from '../core/rules/normalize'
import { scanDocument } from '../core/scanner/scan-document'
import { annotationStore } from '../core/store/annotation-store'
import { applyBeaconDecorations } from '../decorations/apply-decorations'
import { DecorationTypeCache } from '../decorations/decoration-type-cache'
import { shouldTrackEditor } from '../utils/editor-filter'
import { logger } from '../utils/logger'

interface DisposableRef<T> extends Ref<T> {
  dispose: () => void
}

function useDebouncedRef<T>(source: Ref<T>, ms: number): DisposableRef<T> {
  const debounced = ref(source.value) as DisposableRef<T>
  let timer: ReturnType<typeof setTimeout> | undefined
  const stop = watch(source, value => {
    if (timer) {
      clearTimeout(timer)
    }
    timer = setTimeout(() => {
      debounced.value = value
    }, ms)
  })

  debounced.dispose = () => {
    if (timer) {
      clearTimeout(timer)
    }
    stop()
  }

  return debounced
}

function editorKey(editor: TextEditor): string {
  return `${editor.document.uri.toString()}:${editor.viewColumn ?? 0}`
}

function setupEditor(editor: TextEditor, cache: DecorationTypeCache) {
  const text = useDocumentText(editor.document)
  const debouncedText = useDebouncedRef(text, 120)
  let disposed = false
  let pendingVersion = 0

  const stop = watch(
    () =>
      JSON.stringify({
        text: debouncedText.value,
        languageId: editor.document.languageId,
        enable: config.enable,
        rules: config.rules,
        commentOnly: config.commentOnly,
        maxFileSize: config.maxFileSize,
        decorations: config.decorations.enabled,
      }),
    () => {
      if (disposed) {
        return
      }

      pendingVersion++
      const version = pendingVersion
      const normalized = normalizeRules(config.rules)
      if (normalized.errors.length > 0 && config.debug) {
        for (const error of normalized.errors) {
          logger.warn(error.message)
        }
      }

      const result = scanDocument({
        text: debouncedText.value,
        languageId: editor.document.languageId,
        uri: editor.document.uri.toString(),
        source: 'visibleEditor',
        rules: normalized.rules,
        commentOnly: config.commentOnly,
        maxFileSize: config.maxFileSize,
      })

      if (disposed || version !== pendingVersion) {
        return
      }

      annotationStore.setForUri(
        editor.document.uri.toString(),
        result.annotations,
      )
      if (config.enable && config.decorations.enabled) {
        applyBeaconDecorations(
          editor,
          cache,
          result.annotations,
          normalized.rules,
        )
      }
    },
    { immediate: true },
  )

  return () => {
    disposed = true
    pendingVersion++
    debouncedText.dispose()
    stop()
  }
}

export function useBeaconHighlight() {
  const visibleEditors = useVisibleTextEditors()
  const states = new Map<
    string,
    { cache: DecorationTypeCache; dispose: () => void }
  >()

  watch(
    visibleEditors,
    editors => {
      const trackedEditors = editors.filter(shouldTrackEditor)
      const activeKeys = new Set(trackedEditors.map(editorKey))

      for (const [key, state] of states) {
        if (!activeKeys.has(key)) {
          state.dispose()
          state.cache.clear()
          states.delete(key)
        }
      }

      for (const editor of trackedEditors) {
        const key = editorKey(editor)
        if (states.has(key)) {
          continue
        }
        const cache = new DecorationTypeCache()
        states.set(key, {
          cache,
          dispose: setupEditor(editor, cache),
        })
      }
    },
    { immediate: true },
  )

  onDeactivate(() => {
    for (const state of states.values()) {
      state.dispose()
      state.cache.clear()
    }
    states.clear()
  })
}
```

Modify `src/index.ts`:

```ts
import { defineExtension } from 'reactive-vscode'
import { version } from '../package.json'
import { useBeaconHighlight } from './composables/use-beacon-highlight'
import { logger } from './utils/logger'

const { activate, deactivate } = defineExtension(() => {
  logger.info(`Activated, version: ${version}`)

  useBeaconHighlight()
})

export { activate, deactivate }
```

- [ ] **Step 7: Run decoration tests**

Run:

```bash
rtk pnpm vitest tests/decoration-type-cache.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
rtk pnpm format:check
rtk pnpm lint
pnpm typecheck
rtk git add src/utils/editor-filter.ts src/decorations/decoration-type-cache.ts src/decorations/apply-decorations.ts src/composables/use-beacon-highlight.ts src/index.ts tests/decoration-type-cache.test.ts
rtk git commit -m "feat: highlight visible beacon annotations"
```

Expected: commit succeeds.

## Task 6: Commands, Navigation, Clipboard, and Export Strings

**Files:**

- Create: `src/commands/index.ts`
- Create: `src/commands/navigation.ts`
- Create: `src/commands/export.ts`
- Modify: `src/index.ts`
- Create: `tests/export.test.ts`

**Interfaces:**

- Consumes: `annotationStore`, `formatBeaconLink`, generated `commands`.
- Produces `useCommands(): void`.
- Produces `formatAnnotationsAsMarkdown`, `formatAnnotationsAsJson`, `formatAnnotationsAsCsv`.

- [ ] **Step 1: Write export tests**

Create `tests/export.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  formatAnnotationsAsCsv,
  formatAnnotationsAsJson,
  formatAnnotationsAsMarkdown,
} from '../src/commands/export'
import type { BeaconAnnotation } from '../src/types/annotation'

const annotation: BeaconAnnotation = {
  id: 'a',
  ruleId: 'todo',
  category: 'todo',
  severity: 'information',
  uri: 'file:///workspace/src/a.ts',
  languageId: 'typescript',
  range: {
    start: { line: 0, character: 3 },
    end: { line: 0, character: 8 },
  },
  keywordRange: {
    start: { line: 0, character: 3 },
    end: { line: 0, character: 8 },
  },
  line: 0,
  column: 3,
  keyword: 'TODO:',
  message: 'ship it',
  source: 'visibleEditor',
}

describe('export formatters', () => {
  it('formats Markdown', () => {
    expect(formatAnnotationsAsMarkdown([annotation])).toBe(
      '- [information] TODO file:///workspace/src/a.ts:1:4 - ship it',
    )
  })

  it('formats JSON', () => {
    expect(formatAnnotationsAsJson([annotation])).toContain(
      '"message": "ship it"',
    )
  })

  it('formats CSV with escaped messages', () => {
    expect(
      formatAnnotationsAsCsv([{ ...annotation, message: 'ship, "now"' }]),
    ).toBe(
      'severity,category,rule,file,line,column,message\ninformation,todo,todo,file:///workspace/src/a.ts,1,4,"ship, ""now"""',
    )
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
rtk pnpm vitest tests/export.test.ts
```

Expected: FAIL because export module does not exist.

- [ ] **Step 3: Implement export formatters and commands**

Create `src/commands/export.ts`:

```ts
import { env, Selection, Uri, window, workspace } from 'vscode'
import type { BeaconAnnotation } from '../types/annotation'
import { formatBeaconLink } from '../utils/ranges'

export function formatAnnotationsAsMarkdown(
  annotations: readonly BeaconAnnotation[],
): string {
  return annotations
    .map(
      annotation =>
        `- [${annotation.severity}] ${annotation.keyword.replace(/:$/, '')} ${formatBeaconLink(annotation)} - ${annotation.message}`,
    )
    .join('\n')
}

export function formatAnnotationsAsJson(
  annotations: readonly BeaconAnnotation[],
): string {
  return JSON.stringify(annotations, null, 2)
}

function csvEscape(value: string | number): string {
  const text = String(value)
  if (!/[",\n]/.test(text)) {
    return text
  }
  return `"${text.replaceAll('"', '""')}"`
}

export function formatAnnotationsAsCsv(
  annotations: readonly BeaconAnnotation[],
): string {
  return [
    'severity,category,rule,file,line,column,message',
    ...annotations.map(annotation =>
      [
        annotation.severity,
        annotation.category,
        annotation.ruleId,
        annotation.uri,
        annotation.line + 1,
        annotation.column + 1,
        annotation.message,
      ]
        .map(csvEscape)
        .join(','),
    ),
  ].join('\n')
}

export async function copyExportedAnnotations(
  annotations: readonly BeaconAnnotation[],
  format: 'markdown' | 'json' | 'csv',
) {
  const text =
    format === 'json'
      ? formatAnnotationsAsJson(annotations)
      : format === 'csv'
        ? formatAnnotationsAsCsv(annotations)
        : formatAnnotationsAsMarkdown(annotations)

  await env.clipboard.writeText(text)
  await window.showInformationMessage(
    `Copied ${annotations.length} beacons as ${format}.`,
  )
}

export async function writeExportedAnnotations(
  annotations: readonly BeaconAnnotation[],
  format: 'markdown' | 'json' | 'csv',
) {
  const extension = format === 'json' ? 'json' : format === 'csv' ? 'csv' : 'md'
  const target = await window.showSaveDialog({
    defaultUri: Uri.file(`code-beacon.${extension}`),
    filters: {
      'Code Beacon Export': [extension],
    },
  })

  if (!target) {
    return
  }

  const text =
    format === 'json'
      ? formatAnnotationsAsJson(annotations)
      : format === 'csv'
        ? formatAnnotationsAsCsv(annotations)
        : formatAnnotationsAsMarkdown(annotations)

  await workspace.fs.writeFile(target, new TextEncoder().encode(text))
}
```

Create `src/commands/navigation.ts`:

```ts
import { env, Uri, window, workspace } from 'vscode'
import type { BeaconAnnotation } from '../types/annotation'
import { formatBeaconLink, toVscodeRange } from '../utils/ranges'

export async function revealAnnotation(annotation: BeaconAnnotation) {
  const document = await workspace.openTextDocument(Uri.parse(annotation.uri))
  const editor = await window.showTextDocument(document)
  const range = toVscodeRange(annotation.range)
  editor.selection = new Selection(range.start, range.end)
  editor.revealRange(range)
}

export async function copyAnnotationLink(annotation: BeaconAnnotation) {
  await env.clipboard.writeText(formatBeaconLink(annotation))
}

export async function copyAnnotationMarkdown(annotation: BeaconAnnotation) {
  await env.clipboard.writeText(
    `- [${annotation.severity}] ${annotation.keyword.replace(/:$/, '')} ${formatBeaconLink(annotation)} - ${annotation.message}`,
  )
}
```

Create `src/commands/index.ts`:

```ts
import { useCommand } from 'reactive-vscode'
import { commands } from '../meta'
import { config } from '../config'
import { annotationStore } from '../core/store/annotation-store'
import { copyExportedAnnotations } from './export'
import {
  copyAnnotationLink,
  copyAnnotationMarkdown,
  revealAnnotation,
} from './navigation'
import type { BeaconAnnotation } from '../types/annotation'

function firstAnnotation(value: unknown): BeaconAnnotation | undefined {
  if (value && typeof value === 'object' && 'id' in value) {
    return value as BeaconAnnotation
  }
  return annotationStore.getAll()[0]
}

export function useCommands() {
  useCommand(commands.enable, () => config.update('enable', true))
  useCommand(commands.disable, () => config.update('enable', false))
  useCommand(commands.toggle, () => config.update('enable', !config.enable))
  useCommand(commands.refresh, () => annotationStore.clear())
  useCommand(commands.clearCache, () => annotationStore.clear())
  useCommand(commands.reveal, value => {
    const annotation = firstAnnotation(value)
    return annotation ? revealAnnotation(annotation) : undefined
  })
  useCommand(commands.copyLink, value => {
    const annotation = firstAnnotation(value)
    return annotation ? copyAnnotationLink(annotation) : undefined
  })
  useCommand(commands.copyMarkdown, value => {
    const annotation = firstAnnotation(value)
    return annotation ? copyAnnotationMarkdown(annotation) : undefined
  })
  useCommand(commands.exportMarkdown, () =>
    copyExportedAnnotations(annotationStore.getAll(), 'markdown'),
  )
  useCommand(commands.exportJson, () =>
    copyExportedAnnotations(annotationStore.getAll(), 'json'),
  )
  useCommand(commands.exportCsv, () =>
    copyExportedAnnotations(annotationStore.getAll(), 'csv'),
  )
}
```

Modify `src/index.ts` to call `useCommands()` before `useBeaconHighlight()`:

```ts
import { defineExtension } from 'reactive-vscode'
import { version } from '../package.json'
import { useCommands } from './commands'
import { useBeaconHighlight } from './composables/use-beacon-highlight'
import { logger } from './utils/logger'

const { activate, deactivate } = defineExtension(() => {
  logger.info(`Activated, version: ${version}`)

  useCommands()
  useBeaconHighlight()
})

export { activate, deactivate }
```

- [ ] **Step 4: Run export tests**

Run:

```bash
rtk pnpm vitest tests/export.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
rtk pnpm format:check
rtk pnpm lint
pnpm typecheck
rtk git add src/commands/index.ts src/commands/navigation.ts src/commands/export.ts src/index.ts tests/export.test.ts
rtk git commit -m "feat: add beacon commands and export"
```

Expected: commit succeeds.

## Task 7: TreeView Provider

**Files:**

- Create: `src/providers/tree-data-provider.ts`
- Create: `src/composables/use-beacon-tree.ts`
- Modify: `src/index.ts`
- Create: `tests/tree-data-provider.test.ts`

**Interfaces:**

- Consumes: `annotationStore`, `BeaconAnnotation`.
- Produces class `BeaconTreeDataProvider implements TreeDataProvider<BeaconTreeItem>`.
- Produces composable `useBeaconTree(): void`.

- [ ] **Step 1: Write provider test**

Create `tests/tree-data-provider.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import type * as Vscode from 'vscode'
import type { BeaconAnnotation } from '../src/types/annotation'

vi.mock(
  import('vscode'),
  () =>
    ({
      EventEmitter: class EventEmitter<T> {
        public event = vi.fn()
        public fire = vi.fn<(value?: T) => void>()
      },
      ThemeIcon: class ThemeIcon {
        public constructor(public readonly id: string) {}
      },
      TreeItem: class TreeItem {
        public constructor(public label: string) {}
      },
      TreeItemCollapsibleState: {
        None: 0,
        Collapsed: 1,
        Expanded: 2,
      },
    }) as unknown as Partial<typeof Vscode>,
)

function annotation(id: string, uri: string): BeaconAnnotation {
  return {
    id,
    ruleId: 'todo',
    category: 'todo',
    severity: 'information',
    uri,
    languageId: 'typescript',
    range: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 5 },
    },
    keywordRange: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 5 },
    },
    line: 0,
    column: 0,
    keyword: 'TODO:',
    message: 'ship it',
    source: 'visibleEditor',
  }
}

describe('BeaconTreeDataProvider', () => {
  it('groups annotations by file', async () => {
    const { createAnnotationStore } =
      await import('../src/core/store/annotation-store')
    const { BeaconTreeDataProvider } =
      await import('../src/providers/tree-data-provider')
    const store = createAnnotationStore()
    store.setForUri('file:///workspace/src/a.ts', [
      annotation('a', 'file:///workspace/src/a.ts'),
    ])

    const provider = new BeaconTreeDataProvider(store, 'file')
    const roots = await provider.getChildren()
    const children = await provider.getChildren(roots[0])

    expect(roots.map(item => item.label)).toEqual([
      'file:///workspace/src/a.ts',
    ])
    expect(children.map(item => item.label)).toEqual(['TODO: ship it'])
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
rtk pnpm vitest tests/tree-data-provider.test.ts
```

Expected: FAIL because TreeView provider does not exist.

- [ ] **Step 3: Implement TreeView provider**

Create `src/providers/tree-data-provider.ts`:

```ts
import {
  EventEmitter,
  ThemeIcon,
  TreeItem,
  TreeItemCollapsibleState,
} from 'vscode'
import type { Event, TreeDataProvider } from 'vscode'
import type { AnnotationStore } from '../core/store/annotation-store'
import type { BeaconAnnotation } from '../types/annotation'

export type BeaconTreeGroupBy =
  'file' | 'rule' | 'category' | 'severity' | 'owner' | 'flat'

export type BeaconTreeItem =
  | {
      readonly kind: 'group'
      readonly label: string
      readonly annotations: readonly BeaconAnnotation[]
    }
  | {
      readonly kind: 'beacon'
      readonly label: string
      readonly annotation: BeaconAnnotation
    }

export class BeaconTreeDataProvider implements TreeDataProvider<BeaconTreeItem> {
  private readonly changeEmitter = new EventEmitter<
    BeaconTreeItem | undefined
  >()

  public readonly onDidChangeTreeData: Event<BeaconTreeItem | undefined> =
    this.changeEmitter.event

  public constructor(
    private readonly store: AnnotationStore,
    private readonly groupBy: BeaconTreeGroupBy,
  ) {
    this.store.subscribe(() => this.refresh())
  }

  public refresh() {
    this.changeEmitter.fire(undefined)
  }

  public getTreeItem(item: BeaconTreeItem): TreeItem {
    const treeItem = new TreeItem(item.label)

    if (item.kind === 'group') {
      treeItem.collapsibleState = TreeItemCollapsibleState.Expanded
      treeItem.description = `${item.annotations.length}`
      treeItem.iconPath = new ThemeIcon('folder')
      return treeItem
    }

    treeItem.collapsibleState = TreeItemCollapsibleState.None
    treeItem.contextValue = 'beacon'
    treeItem.description = `${item.annotation.line + 1}:${item.annotation.column + 1}`
    treeItem.iconPath = new ThemeIcon('bookmark')
    treeItem.command = {
      command: 'code-beacon.reveal',
      title: 'Reveal Beacon',
      arguments: [item.annotation],
    }

    return treeItem
  }

  public getChildren(item?: BeaconTreeItem): BeaconTreeItem[] {
    if (item?.kind === 'group') {
      return item.annotations.map(annotation => ({
        kind: 'beacon',
        label: `${annotation.keyword} ${annotation.message}`.trim(),
        annotation,
      }))
    }

    if (item?.kind === 'beacon') {
      return []
    }

    const annotations = this.store.getAll()
    if (this.groupBy === 'flat') {
      return annotations.map(annotation => ({
        kind: 'beacon',
        label: `${annotation.keyword} ${annotation.message}`.trim(),
        annotation,
      }))
    }

    const groups = new Map<string, BeaconAnnotation[]>()
    for (const annotation of annotations) {
      const key =
        this.groupBy === 'category'
          ? annotation.category
          : this.groupBy === 'severity'
            ? annotation.severity
            : this.groupBy === 'rule'
              ? annotation.ruleId
              : annotation.uri
      groups.set(key, [...(groups.get(key) ?? []), annotation])
    }

    return [...groups.entries()].map(([label, groupAnnotations]) => ({
      kind: 'group',
      label,
      annotations: groupAnnotations,
    }))
  }
}
```

- [ ] **Step 4: Implement TreeView composable**

Create `src/composables/use-beacon-tree.ts`:

```ts
import { watch } from 'reactive-vscode'
import { window } from 'vscode'
import { config } from '../config'
import { annotationStore } from '../core/store/annotation-store'
import { BeaconTreeDataProvider } from '../providers/tree-data-provider'

export function useBeaconTree() {
  const provider = new BeaconTreeDataProvider(
    annotationStore,
    config.explorer.groupBy,
  )

  window.createTreeView('codeBeacon.annotations', {
    treeDataProvider: provider,
    showCollapseAll: true,
  })

  watch(
    () => config.explorer.groupBy,
    () => provider.refresh(),
  )
}
```

Modify `src/index.ts`:

```ts
import { defineExtension } from 'reactive-vscode'
import { version } from '../package.json'
import { useCommands } from './commands'
import { useBeaconHighlight } from './composables/use-beacon-highlight'
import { useBeaconTree } from './composables/use-beacon-tree'
import { logger } from './utils/logger'

const { activate, deactivate } = defineExtension(() => {
  logger.info(`Activated, version: ${version}`)

  useCommands()
  useBeaconHighlight()
  useBeaconTree()
})

export { activate, deactivate }
```

- [ ] **Step 5: Run TreeView tests**

Run:

```bash
rtk pnpm vitest tests/tree-data-provider.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
rtk pnpm format:check
rtk pnpm lint
pnpm typecheck
rtk git add src/providers/tree-data-provider.ts src/composables/use-beacon-tree.ts src/index.ts tests/tree-data-provider.test.ts
rtk git commit -m "feat: add beacon explorer"
```

Expected: commit succeeds.

## Task 8: Problems Diagnostics Provider

**Files:**

- Create: `src/providers/diagnostics.ts`
- Create: `src/composables/use-beacon-diagnostics.ts`
- Modify: `src/index.ts`
- Create: `tests/diagnostics.test.ts`

**Interfaces:**

- Consumes: `annotationStore`, `toVscodeRange`, `config.diagnostics.mode`.
- Produces function `createDiagnosticsFromAnnotations(annotations: readonly BeaconAnnotation[]): Diagnostic[]`.
- Produces composable `useBeaconDiagnostics(): void`.

- [ ] **Step 1: Write diagnostics test**

Create `tests/diagnostics.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import type * as Vscode from 'vscode'
import type { BeaconAnnotation } from '../src/types/annotation'

vi.mock(
  import('vscode'),
  () =>
    ({
      Diagnostic: class Diagnostic {
        public source?: string
        public code?: string
        public constructor(
          public range: unknown,
          public message: string,
          public severity: number,
        ) {}
      },
      DiagnosticSeverity: {
        Hint: 3,
        Information: 2,
        Warning: 1,
        Error: 0,
      },
      Range: class Range {
        public constructor(
          public startLine: number,
          public startCharacter: number,
          public endLine: number,
          public endCharacter: number,
        ) {}
      },
    }) as unknown as Partial<typeof Vscode>,
)

const annotation: BeaconAnnotation = {
  id: 'a',
  ruleId: 'fixme',
  category: 'fixme',
  severity: 'warning',
  uri: 'file:///workspace/src/a.ts',
  languageId: 'typescript',
  range: {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 6 },
  },
  keywordRange: {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 6 },
  },
  line: 0,
  column: 0,
  keyword: 'FIXME:',
  message: 'repair this',
  source: 'visibleEditor',
}

describe('createDiagnosticsFromAnnotations', () => {
  it('maps beacon annotations to VS Code diagnostics', async () => {
    const { createDiagnosticsFromAnnotations } =
      await import('../src/providers/diagnostics')

    const diagnostics = createDiagnosticsFromAnnotations([annotation])

    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]).toMatchObject({
      message: 'FIXME: repair this',
      severity: 1,
      source: 'Code Beacon',
      code: 'fixme',
    })
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
rtk pnpm vitest tests/diagnostics.test.ts
```

Expected: FAIL because diagnostics provider does not exist.

- [ ] **Step 3: Implement diagnostics provider**

Create `src/providers/diagnostics.ts`:

```ts
import { Diagnostic, DiagnosticSeverity } from 'vscode'
import type { BeaconAnnotation, BeaconSeverity } from '../types/annotation'
import { toVscodeRange } from '../utils/ranges'

function toDiagnosticSeverity(severity: BeaconSeverity): DiagnosticSeverity {
  if (severity === 'error') {
    return DiagnosticSeverity.Error
  }
  if (severity === 'warning') {
    return DiagnosticSeverity.Warning
  }
  if (severity === 'hint') {
    return DiagnosticSeverity.Hint
  }
  return DiagnosticSeverity.Information
}

export function createDiagnosticsFromAnnotations(
  annotations: readonly BeaconAnnotation[],
): Diagnostic[] {
  return annotations.map(annotation => {
    const diagnostic = new Diagnostic(
      toVscodeRange(annotation.range),
      `${annotation.keyword} ${annotation.message}`.trim(),
      toDiagnosticSeverity(annotation.severity),
    )
    diagnostic.source = 'Code Beacon'
    diagnostic.code = annotation.ruleId
    return diagnostic
  })
}
```

- [ ] **Step 4: Implement diagnostics composable**

Create `src/composables/use-beacon-diagnostics.ts`:

```ts
import { watch } from 'reactive-vscode'
import { languages, Uri } from 'vscode'
import { config } from '../config'
import { annotationStore } from '../core/store/annotation-store'
import { createDiagnosticsFromAnnotations } from '../providers/diagnostics'

export function useBeaconDiagnostics() {
  const collection = languages.createDiagnosticCollection('code-beacon')

  const refresh = () => {
    collection.clear()
    if (config.diagnostics.mode === 'off') {
      return
    }

    const byUri = new Map<string, ReturnType<typeof annotationStore.getAll>>()
    for (const annotation of annotationStore.getAll()) {
      byUri.set(annotation.uri, [
        ...(byUri.get(annotation.uri) ?? []),
        annotation,
      ])
    }

    for (const [uri, annotations] of byUri) {
      collection.set(
        Uri.parse(uri),
        createDiagnosticsFromAnnotations(annotations),
      )
    }
  }

  annotationStore.subscribe(refresh)
  watch(() => config.diagnostics.mode, refresh, { immediate: true })
}
```

Modify `src/index.ts`:

```ts
import { defineExtension } from 'reactive-vscode'
import { version } from '../package.json'
import { useCommands } from './commands'
import { useBeaconDiagnostics } from './composables/use-beacon-diagnostics'
import { useBeaconHighlight } from './composables/use-beacon-highlight'
import { useBeaconTree } from './composables/use-beacon-tree'
import { logger } from './utils/logger'

const { activate, deactivate } = defineExtension(() => {
  logger.info(`Activated, version: ${version}`)

  useCommands()
  useBeaconHighlight()
  useBeaconTree()
  useBeaconDiagnostics()
})

export { activate, deactivate }
```

- [ ] **Step 5: Run diagnostics test**

Run:

```bash
rtk pnpm vitest tests/diagnostics.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
rtk pnpm format:check
rtk pnpm lint
pnpm typecheck
rtk git add src/providers/diagnostics.ts src/composables/use-beacon-diagnostics.ts src/index.ts tests/diagnostics.test.ts
rtk git commit -m "feat: add beacon diagnostics"
```

Expected: commit succeeds.

## Task 9: Workspace Scan Command and Playground Fixture

**Files:**

- Create: `src/core/scanner/scan-workspace.ts`
- Modify: `src/commands/index.ts`
- Create: `playground/annotations.ts`
- Create: `tests/workspace-scan.test.ts`

**Interfaces:**

- Consumes: `scanDocument`, `normalizeRules`, generated config, `annotationStore`.
- Produces function `scanWorkspace(options: ScanWorkspaceOptions): Promise<readonly BeaconAnnotation[]>`.
- Produces command behavior for `code-beacon.scanWorkspace`, `code-beacon.scanActiveFile`, `code-beacon.scanOpenEditors`.

- [ ] **Step 1: Write workspace scanner test**

Create `tests/workspace-scan.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { shouldIncludeUri } from '../src/core/scanner/scan-workspace'

describe('shouldIncludeUri', () => {
  it('excludes known generated files', () => {
    expect(
      shouldIncludeUri(
        'file:///workspace/node_modules/pkg/index.js',
        ['**/*'],
        ['**/node_modules/**'],
      ),
    ).toBe(false)
  })

  it('includes regular source files', () => {
    expect(
      shouldIncludeUri(
        'file:///workspace/src/example.ts',
        ['**/*'],
        ['**/node_modules/**'],
      ),
    ).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
rtk pnpm vitest tests/workspace-scan.test.ts
```

Expected: FAIL because workspace scanner does not exist.

- [ ] **Step 3: Implement workspace scanner**

Create `src/core/scanner/scan-workspace.ts`:

```ts
import { workspace } from 'vscode'
import type { Uri } from 'vscode'
import { DEFAULT_EXCLUDE, DEFAULT_INCLUDE } from '../../constants/defaults'
import type {
  BeaconAnnotation,
  CompiledBeaconRule,
} from '../../types/annotation'
import { scanDocument } from './scan-document'

export interface ScanWorkspaceOptions {
  readonly include: readonly string[]
  readonly exclude: readonly string[]
  readonly maxFilesForSearch: number
  readonly maxFileSize: number
  readonly commentOnly: boolean
  readonly rules: readonly CompiledBeaconRule[]
}

function globToRegExp(glob: string): RegExp {
  const source = glob
    .replaceAll('.', '\\.')
    .replaceAll('**/', '(?:.*/)?')
    .replaceAll('/**', '(?:/.*)?')
    .replaceAll('*', '[^/]*')
  return new RegExp(source)
}

export function shouldIncludeUri(
  uri: string,
  include: readonly string[] = DEFAULT_INCLUDE,
  exclude: readonly string[] = DEFAULT_EXCLUDE,
): boolean {
  const path = uri.replace(/^file:\/\//, '')
  const included = include.some(pattern => globToRegExp(pattern).test(path))
  const excluded = exclude.some(pattern => globToRegExp(pattern).test(path))
  return included && !excluded
}

function braceGlob(patterns: readonly string[]): string {
  return patterns.length === 1 ? patterns[0] : `{${patterns.join(',')}}`
}

export async function scanWorkspace(
  options: ScanWorkspaceOptions,
): Promise<readonly BeaconAnnotation[]> {
  const include = braceGlob(options.include)
  const exclude = braceGlob(options.exclude)
  const files = await workspace.findFiles(
    include,
    exclude,
    options.maxFilesForSearch,
  )
  const annotations: BeaconAnnotation[] = []

  for (const uri of files) {
    annotations.push(...(await scanUri(uri, options)))
  }

  return annotations
}

async function scanUri(
  uri: Uri,
  options: ScanWorkspaceOptions,
): Promise<readonly BeaconAnnotation[]> {
  const document = await workspace.openTextDocument(uri)
  return scanDocument({
    text: document.getText(),
    languageId: document.languageId,
    uri: document.uri.toString(),
    source: 'workspace',
    rules: options.rules,
    commentOnly: options.commentOnly,
    maxFileSize: options.maxFileSize,
  }).annotations
}
```

- [ ] **Step 4: Wire scan commands**

Update `src/commands/index.ts` so scan commands normalize rules, scan workspace/open editors/active file, and update `annotationStore`. Add imports:

```ts
import { window, workspace } from 'vscode'
import { normalizeRules } from '../core/rules/normalize'
import { scanDocument } from '../core/scanner/scan-document'
import { scanWorkspace } from '../core/scanner/scan-workspace'
```

Add helpers above `useCommands()`:

```ts
function normalizedRules() {
  return normalizeRules(config.rules).rules
}

async function scanActiveFile() {
  const editor = window.activeTextEditor
  if (!editor) {
    return
  }

  const result = scanDocument({
    text: editor.document.getText(),
    languageId: editor.document.languageId,
    uri: editor.document.uri.toString(),
    source: 'openEditor',
    rules: normalizedRules(),
    commentOnly: config.commentOnly,
    maxFileSize: config.maxFileSize,
  })
  annotationStore.setForUri(editor.document.uri.toString(), result.annotations)
}

async function scanOpenEditors() {
  for (const document of workspace.textDocuments) {
    const result = scanDocument({
      text: document.getText(),
      languageId: document.languageId,
      uri: document.uri.toString(),
      source: 'openEditor',
      rules: normalizedRules(),
      commentOnly: config.commentOnly,
      maxFileSize: config.maxFileSize,
    })
    annotationStore.setForUri(document.uri.toString(), result.annotations)
  }
}

async function scanWorkspaceIntoStore() {
  const annotations = await scanWorkspace({
    include: config.include,
    exclude: config.exclude,
    maxFilesForSearch: config.maxFilesForSearch,
    maxFileSize: config.maxFileSize,
    commentOnly: config.commentOnly,
    rules: normalizedRules(),
  })

  annotationStore.clear()
  for (const annotation of annotations) {
    annotationStore.setForUri(annotation.uri, [
      ...annotationStore.getForUri(annotation.uri),
      annotation,
    ])
  }
}
```

Register commands inside `useCommands()`:

```ts
useCommand(commands.scanActiveFile, scanActiveFile)
useCommand(commands.scanOpenEditors, scanOpenEditors)
useCommand(commands.scanWorkspace, scanWorkspaceIntoStore)
```

- [ ] **Step 5: Add playground fixture**

Create `playground/annotations.ts`:

```ts
// TODO: verify keyword marker rendering
export const releaseReady = false

// FIXME(owner): replace mock export before marketplace release
export function publishableValue() {
  return releaseReady
}

// SECURITY: audit untrusted workspace behavior before enabling Git features
export const trustBoundary = 'workspace'
```

- [ ] **Step 6: Run workspace tests**

Run:

```bash
rtk pnpm vitest tests/workspace-scan.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
rtk pnpm format:check
rtk pnpm lint
pnpm typecheck
rtk git add src/core/scanner/scan-workspace.ts src/commands/index.ts playground/annotations.ts tests/workspace-scan.test.ts
rtk git commit -m "feat: scan workspace beacons"
```

Expected: commit succeeds.

## Task 10: Publish Readiness, README, and Release Verification

**Files:**

- Modify: `README.md`
- Create: `tests/readme.test.ts`
- Create: `tests/e2e/run.ts`

**Interfaces:**

- Consumes all user-facing commands and config keys from previous tasks.
- Produces marketplace-ready README sections and package verification.

- [ ] **Step 1: Write README test**

Create `tests/readme.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readme = readFileSync('README.md', 'utf8')

describe('README', () => {
  it('documents the publishable MVP user flow', () => {
    expect(readme).toContain('# Code Beacon')
    expect(readme).toContain('Scan Workspace for Beacons')
    expect(readme).toContain('Code Beacon Explorer')
    expect(readme).toContain('Problems integration is off by default')
    expect(readme).toContain('VS Code Web')
  })

  it('documents core configuration keys', () => {
    expect(readme).toContain('code-beacon.rules')
    expect(readme).toContain('code-beacon.diagnostics.mode')
    expect(readme).toContain('code-beacon.maxFilesForSearch')
  })
})
```

- [ ] **Step 2: Run README test to verify failure**

Run:

```bash
rtk pnpm vitest tests/readme.test.ts
```

Expected: FAIL until README is updated.

- [ ] **Step 3: Update README**

Replace the top content of `README.md` with this structure while keeping badges and license:

````md
# Code Beacon

Code Beacon highlights and organizes code annotations such as TODO, FIXME, BUG, NOTE, REVIEW, SECURITY, and PERF. It gives you editor highlights, a Code Beacon Explorer, optional Problems integration, workspace scans, and export commands without requiring native tools.

## Features

- Highlight annotation keywords in visible editors.
- List annotations in the Code Beacon Explorer.
- Scan the active file, open editors, or the workspace.
- Copy annotation links and Markdown snippets.
- Export beacons as Markdown, JSON, or CSV.
- Keep Problems integration off by default to avoid noisy workspaces.
- Support VS Code Web, Remote, and Virtual Workspaces through VS Code workspace APIs.

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

## Configuration

The most important settings are:

- `code-beacon.enable`: enable or disable Code Beacon.
- `code-beacon.rules`: custom annotation rules. Built-in rules cover TODO, FIXME, BUG, HACK, NOTE, REVIEW, SECURITY, PERF, and QUESTION.
- `code-beacon.include`: workspace scan include globs.
- `code-beacon.exclude`: workspace scan exclude globs.
- `code-beacon.maxFileSize`: maximum document text length to scan.
- `code-beacon.maxFilesForSearch`: maximum files scanned by workspace scan.
- `code-beacon.commentOnly`: scan known comment ranges before falling back to full-text scanning.
- `code-beacon.diagnostics.mode`: Problems integration mode. Problems integration is off by default.
- `code-beacon.explorer.groupBy`: TreeView grouping mode.

Example custom rule:

```jsonc
{
  "code-beacon.rules": [
    {
      "id": "security",
      "label": "Security",
      "category": "security",
      "enabled": true,
      "matcher": {
        "type": "text",
        "value": "SECURITY",
        "wholeWord": true,
        "colon": "optional",
      },
      "severity": "error",
      "commentOnly": true,
    },
  ],
}
```
````

## VS Code Web

Code Beacon supports browser-based VS Code environments, including vscode.dev and github.dev. Runtime workspace scans use VS Code APIs instead of native ripgrep by default.

## Current MVP Limits

- Git blame and AI actions are planned follow-up features.
- Comment-only scanning uses built-in comment syntax for common languages and falls back to full-text scanning for unknown languages.
- Problems integration is opt-in through `code-beacon.diagnostics.mode`.

## License

[MIT](./LICENSE) License © 2026-PRESENT [ntnyq](https://github.com/ntnyq)

````

- [ ] **Step 4: Add e2e smoke runner**

Create `tests/e2e/run.ts`:

```ts
import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const entry = resolve('dist/index.js')

if (!existsSync(entry)) {
  console.error(`Expected build output at ${entry}`)
  process.exit(1)
}

if (statSync(entry).size === 0) {
  console.error(`Expected non-empty build output at ${entry}`)
  process.exit(1)
}

console.log(`Build output exists: ${entry}`)
````

- [ ] **Step 5: Run README test and package verification**

Run:

```bash
rtk pnpm vitest tests/readme.test.ts
rtk pnpm format:check
rtk pnpm lint
pnpm typecheck
rtk pnpm test:unit
rtk pnpm build
rtk pnpm pack
```

Expected:

- README test passes.
- formatting/lint/typecheck pass.
- unit tests pass.
- build emits `dist/index.js`.
- `vsce package --no-dependencies` creates a `.vsix` file.

- [ ] **Step 6: Commit**

Run:

```bash
rtk git add README.md tests/readme.test.ts tests/e2e/run.ts package.json
rtk git commit -m "docs: prepare Code Beacon for marketplace"
```

Expected: commit succeeds.

## Self-Review

Spec coverage:

- Product positioning: implemented in README and marketplace metadata.
- Default annotation rules: Task 2.
- Text and regex matching: Task 2 and Task 3.
- Comment-only scanning: Task 3.
- Visible editor decorations: Task 5.
- TreeView: Task 7.
- Commands: Task 1 and Task 6.
- Problems diagnostics: Task 8.
- Workspace scan: Task 9.
- Export: Task 6.
- Web/Virtual Workspace compatibility: global constraints, Task 9, Task 10.
- Git and AI: explicitly deferred to follow-up plans because they are independent subsystems.

Placeholder scan:

- No banned placeholder instructions are present.
- Domain examples include the annotation keyword `TODO`; these are product examples, not placeholders.

Type consistency:

- `BeaconAnnotation`, `BeaconRuleConfig`, `CompiledBeaconRule`, `SerializedRange`, `annotationStore`, `scanDocument`, `normalizeRules`, and formatter names are defined before later tasks consume them.
- Command IDs match the Task 1 `package.json` contribution list.
