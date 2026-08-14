# AnnoPulse Publishable MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a publishable AnnoPulse MVP that scans code annotations, highlights them in visible editors, lists them in a TreeView, optionally reports them in Problems, exports them, and packages cleanly for the VS Code Marketplace.

**Architecture:** Implement a small pure core first: rule normalization, matching, comment ranges, document scanning, and an annotation store. Then wire that core into reactive-vscode composables for decorations, commands, TreeView, diagnostics, workspace scanning, and export. Keep Git blame and AI out of this first publishable MVP; they become separate follow-up plans after the annotation model is stable.

**Tech Stack:** VS Code extension API `^1.125.0`, TypeScript strict mode, reactive-vscode `^1.0.2`, tsdown `^0.22.3`, vitest `^4.1.10`, vscode-ext-gen `^1.6.0`, pnpm `11.10.0`.

## Global Constraints

- Extension display name is `AnnoPulse`; npm package name is `annopulse`; contributed configuration scope is `annopulse`.
- Keep `main` and `browser` as `./dist/index.js`; runtime must keep supporting VS Code Web, Remote, and Virtual Workspaces.
- Do not add runtime dependencies for the MVP unless a task explicitly revises this plan; use VS Code APIs, reactive-vscode, and local pure functions.
- Do not make `ripgrep`, Node `fs`, Git shell commands, or AI APIs required for the MVP.
- Default Problems integration must remain off: `annopulse.diagnostics.mode` default is `"off"`.
- Use `workspace.fs` or `workspace.openTextDocument` for workspace reads; avoid Node-only filesystem APIs in extension runtime.
- Generate `src/meta.ts` with `pnpm generate:meta` after editing `package.json`; do not hand-edit generated metadata except in tests.
- Follow repository command policy: prefix shell commands with `rtk` except `pnpm typecheck`.
- Each task ends with `rtk pnpm format:check`, `rtk pnpm lint`, `pnpm typecheck`, and the task-specific vitest command unless the task states a narrower verification.

---

## Scope Check

`docs/plan.md` describes Phase 1 through Phase 4. This plan implements a publishable MVP from Phase 1 plus the smallest Phase 2 pieces needed for marketplace usefulness: workspace scan, TreeView, Problems mode, export, docs, packaging, and smoke tests. Git blame, stale-age filters, ownerless analysis, Language Model Tool contributions, AI fix generation, and issue creation are intentionally excluded because they are independent subsystems with different security and API risks.

Follow-up plans after this MVP ships:

- `annopulse-git-blame.md`
- `annopulse-ai-tools.md`
- `annopulse-notebook-polish.md`

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
- `src/composables/use-annotation-highlight.ts`: watch visible editors and update scan/store/decorations.
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
    views?: { annopulse: { id: string; name: string }[] }
  }
}

describe('package metadata', () => {
  it('declares marketplace metadata for AnnoPulse', () => {
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
      'annopulse.enable',
      'annopulse.disable',
      'annopulse.toggle',
      'annopulse.refresh',
      'annopulse.scanWorkspace',
      'annopulse.scanActiveFile',
      'annopulse.scanOpenEditors',
      'annopulse.focusExplorer',
      'annopulse.reveal',
      'annopulse.copyLink',
      'annopulse.copyMarkdown',
      'annopulse.exportMarkdown',
      'annopulse.exportJson',
      'annopulse.exportCsv',
      'annopulse.openSettings',
      'annopulse.clearCache',
    ])
  })

  it('declares configuration keys used by the MVP runtime', () => {
    const keys = Object.keys(pkg.contributes.configuration.properties)

    expect(keys).toEqual([
      'annopulse.enable',
      'annopulse.debug',
      'annopulse.languages',
      'annopulse.rules',
      'annopulse.include',
      'annopulse.exclude',
      'annopulse.respectFilesExclude',
      'annopulse.respectSearchExclude',
      'annopulse.maxFileSize',
      'annopulse.maxFilesForSearch',
      'annopulse.scanMode',
      'annopulse.commentOnly',
      'annopulse.decorations.enabled',
      'annopulse.diagnostics.mode',
      'annopulse.explorer.enabled',
      'annopulse.explorer.groupBy',
      'annopulse.codelens.enabled',
      'annopulse.hover.enabled',
      'annopulse.export.defaultFormat',
    ])
  })

  it('declares the AnnoPulse TreeView contribution', () => {
    expect(pkg.activationEvents).toContain('onView:annopulse.annotations')
    expect(pkg.contributes.viewsContainers?.activitybar).toEqual([
      {
        id: 'annopulse',
        title: 'AnnoPulse',
        icon: './res/icon.png',
      },
    ])
    expect(pkg.contributes.views?.annopulse).toEqual([
      {
        id: 'annopulse.annotations',
        name: 'Annotations',
        when: 'annopulse.explorer.enabled',
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
    "AnnoPulse",
  ],
  "extensionKind": ["ui", "workspace"],
}
```

Replace `contributes` with this complete MVP contribution object:

```jsonc
{
  "configuration": {
    "title": "AnnoPulse",
    "properties": {
      "annopulse.enable": {
        "type": "boolean",
        "default": true,
        "description": "Enable or disable AnnoPulse.",
      },
      "annopulse.debug": {
        "type": "boolean",
        "default": false,
        "description": "Enable debug logging.",
      },
      "annopulse.languages": {
        "type": "array",
        "default": ["*"],
        "items": { "type": "string" },
        "description": "Language IDs where annotations are scanned. Use '*' for all languages and prefix with '!' to exclude.",
      },
      "annopulse.rules": {
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
      "annopulse.include": {
        "type": "array",
        "default": ["**/*"],
        "items": { "type": "string" },
        "scope": "resource",
        "description": "Glob patterns that define files to scan.",
      },
      "annopulse.exclude": {
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
      "annopulse.respectFilesExclude": {
        "type": "boolean",
        "default": true,
        "description": "Respect VS Code files.exclude during workspace scans.",
      },
      "annopulse.respectSearchExclude": {
        "type": "boolean",
        "default": true,
        "description": "Respect VS Code search.exclude during workspace scans.",
      },
      "annopulse.maxFileSize": {
        "type": "number",
        "default": 1000000,
        "minimum": 0,
        "description": "Maximum document text length, in characters, to scan. Set to 0 to disable this size limit.",
      },
      "annopulse.maxFilesForSearch": {
        "type": "number",
        "default": 5000,
        "minimum": 1,
        "description": "Maximum number of files to scan during workspace scans.",
      },
      "annopulse.scanMode": {
        "type": "string",
        "default": "visibleEditors",
        "enum": ["visibleEditors", "openEditors", "workspace", "manual"],
        "description": "Default scan mode for AnnoPulse.",
      },
      "annopulse.commentOnly": {
        "type": "boolean",
        "default": true,
        "description": "Prefer scanning comments only when AnnoPulse knows the language comment syntax.",
      },
      "annopulse.decorations.enabled": {
        "type": "boolean",
        "default": true,
        "description": "Show editor decorations for annotations.",
      },
      "annopulse.diagnostics.mode": {
        "type": "string",
        "default": "off",
        "enum": ["off", "openFiles", "workspace"],
        "description": "Controls Problems integration.",
      },
      "annopulse.explorer.enabled": {
        "type": "boolean",
        "default": true,
        "description": "Enable the AnnoPulse TreeView.",
      },
      "annopulse.explorer.groupBy": {
        "type": "string",
        "default": "file",
        "enum": ["file", "rule", "category", "severity", "owner", "flat"],
        "description": "Default grouping mode for the AnnoPulse TreeView.",
      },
      "annopulse.codelens.enabled": {
        "type": "boolean",
        "default": false,
        "description": "Enable CodeLens actions above annotation lines.",
      },
      "annopulse.hover.enabled": {
        "type": "boolean",
        "default": true,
        "description": "Enable hover details for annotations.",
      },
      "annopulse.export.defaultFormat": {
        "type": "string",
        "default": "markdown",
        "enum": ["markdown", "json", "csv"],
        "description": "Default export format.",
      },
    },
  },
  "commands": [
    {
      "category": "AnnoPulse",
      "command": "annopulse.enable",
      "title": "Enable AnnoPulse",
    },
    {
      "category": "AnnoPulse",
      "command": "annopulse.disable",
      "title": "Disable AnnoPulse",
    },
    {
      "category": "AnnoPulse",
      "command": "annopulse.toggle",
      "title": "Toggle AnnoPulse",
    },
    {
      "category": "AnnoPulse",
      "command": "annopulse.refresh",
      "title": "Refresh Annotations",
    },
    {
      "category": "AnnoPulse",
      "command": "annopulse.scanWorkspace",
      "title": "Scan Workspace for Annotations",
    },
    {
      "category": "AnnoPulse",
      "command": "annopulse.scanActiveFile",
      "title": "Scan Active File for Annotations",
    },
    {
      "category": "AnnoPulse",
      "command": "annopulse.scanOpenEditors",
      "title": "Scan Open Editors for Annotations",
    },
    {
      "category": "AnnoPulse",
      "command": "annopulse.focusExplorer",
      "title": "Focus AnnoPulse Explorer",
    },
    {
      "category": "AnnoPulse",
      "command": "annopulse.reveal",
      "title": "Reveal Annotation",
    },
    {
      "category": "AnnoPulse",
      "command": "annopulse.copyLink",
      "title": "Copy Annotation Link",
    },
    {
      "category": "AnnoPulse",
      "command": "annopulse.copyMarkdown",
      "title": "Copy Annotation as Markdown",
    },
    {
      "category": "AnnoPulse",
      "command": "annopulse.exportMarkdown",
      "title": "Export Annotations as Markdown",
    },
    {
      "category": "AnnoPulse",
      "command": "annopulse.exportJson",
      "title": "Export Annotations as JSON",
    },
    {
      "category": "AnnoPulse",
      "command": "annopulse.exportCsv",
      "title": "Export Annotations as CSV",
    },
    {
      "category": "AnnoPulse",
      "command": "annopulse.openSettings",
      "title": "Open AnnoPulse Settings",
    },
    {
      "category": "AnnoPulse",
      "command": "annopulse.clearCache",
      "title": "Clear AnnoPulse Cache",
    },
  ],
  "viewsContainers": {
    "activitybar": [
      {
        "id": "annopulse",
        "title": "AnnoPulse",
        "icon": "./res/icon.png",
      },
    ],
  },
  "views": {
    "annopulse": [
      {
        "id": "annopulse.annotations",
        "name": "Annotations",
        "when": "annopulse.explorer.enabled",
      },
    ],
  },
  "menus": {
    "view/title": [
      {
        "command": "annopulse.refresh",
        "when": "view == annopulse.annotations",
        "group": "navigation",
      },
      {
        "command": "annopulse.scanWorkspace",
        "when": "view == annopulse.annotations",
        "group": "navigation",
      },
    ],
    "view/item/context": [
      {
        "command": "annopulse.reveal",
        "when": "view == annopulse.annotations && viewItem == annotation",
        "group": "inline",
      },
      {
        "command": "annopulse.copyLink",
        "when": "view == annopulse.annotations && viewItem == annotation",
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

Expected: `src/meta.ts` contains every new `annopulse.*` command and config key.

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
rtk git commit -m "feat: declare AnnoPulse MVP contributions"
```

Expected: commit succeeds.

## Task 2: Domain Types, Default Rules, and Rule Normalization

**Files:**

- Create: `src/types/annotation.ts`
- Create: `src/constants/defaults.ts`
- Create: `src/core/rules/normalize.ts`
- Create: `tests/rules.test.ts`

**Interfaces:**

- Produces type `AnnoPulseRuleConfig`, `AnnoPulseRule`, `CompiledAnnoPulseRule`, `AnnoPulseAnnotation`, `AnnoPulseSeverity`, `AnnoPulseCategory`, `SerializedRange`.
- Produces function `normalizeRules(customRules: readonly AnnoPulseRuleConfig[]): NormalizedRuleResult`.
- Later scanner tasks consume `CompiledAnnoPulseRule.matcherRegex`, `CompiledAnnoPulseRule.messageMode`, and `CompiledAnnoPulseRule.style`.

- [ ] **Step 1: Write failing tests**

Create `tests/rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_ANNOPULSE_RULES } from '../src/constants/defaults'
import { normalizeRules } from '../src/core/rules/normalize'
import type { AnnoPulseRuleConfig } from '../src/types/annotation'

describe('normalizeRules', () => {
  it('returns enabled built-in rules when no custom rules are provided', () => {
    const result = normalizeRules([])

    expect(result.errors).toEqual([])
    expect(result.rules.map(rule => rule.id)).toEqual(
      DEFAULT_ANNOPULSE_RULES.map(rule => rule.id),
    )
    expect(
      result.rules.find(rule => rule.id === 'todo')?.matcherRegex.source,
    ).toBe('\\bTODO:?')
  })

  it('overrides a built-in rule by id', () => {
    const customRules: AnnoPulseRuleConfig[] = [
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
export type AnnoPulseCategory =
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

export type AnnoPulseSeverity = 'hint' | 'information' | 'warning' | 'error'

export type AnnoPulseMarker = 'keyword' | 'message' | 'line'

export interface SerializedPosition {
  readonly line: number
  readonly character: number
}

export interface SerializedRange {
  readonly start: SerializedPosition
  readonly end: SerializedPosition
}

export interface AnnoPulseTextMatcherConfig {
  readonly type: 'text'
  readonly value: string
  readonly caseSensitive?: boolean
  readonly wholeWord?: boolean
  readonly colon?: 'required' | 'optional' | 'forbidden'
}

export interface AnnoPulseRegexMatcherConfig {
  readonly type: 'regex'
  readonly pattern: string
  readonly flags?: string
}

export type AnnoPulseMatcherConfig =
  AnnoPulseTextMatcherConfig | AnnoPulseRegexMatcherConfig

export interface AnnoPulseStyleConfig {
  readonly marker?: AnnoPulseMarker
  readonly color?: string
  readonly backgroundColor?: string
  readonly border?: string
  readonly borderRadius?: string
  readonly overviewRulerColor?: string
}

export interface AnnoPulseDiagnosticsConfig {
  readonly enabled?: boolean
  readonly severity?: AnnoPulseSeverity
}

export interface AnnoPulseMessageConfig {
  readonly mode?: 'lineRest' | 'match' | 'group'
  readonly group?: string
  readonly trim?: boolean
}

export interface AnnoPulseRuleConfig {
  readonly id: string
  readonly label: string
  readonly category: AnnoPulseCategory
  readonly enabled?: boolean
  readonly matcher: AnnoPulseMatcherConfig
  readonly message?: AnnoPulseMessageConfig
  readonly severity: AnnoPulseSeverity
  readonly commentOnly?: boolean
  readonly languages?: readonly string[]
  readonly style?: AnnoPulseStyleConfig
  readonly diagnostics?: AnnoPulseDiagnosticsConfig
}

export interface CompiledAnnoPulseRule extends AnnoPulseRuleConfig {
  readonly enabled: true
  readonly matcherRegex: RegExp
  readonly caseSensitive: boolean
  readonly messageMode: Required<AnnoPulseMessageConfig>
  readonly style: Required<AnnoPulseStyleConfig>
}

export interface AnnoPulseRuleError {
  readonly ruleId: string
  readonly message: string
}

export interface NormalizedRuleResult {
  readonly rules: readonly CompiledAnnoPulseRule[]
  readonly errors: readonly AnnoPulseRuleError[]
}

export interface AnnoPulseAnnotation {
  readonly id: string
  readonly ruleId: string
  readonly category: AnnoPulseCategory
  readonly severity: AnnoPulseSeverity
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
import type {
  AnnoPulseRuleConfig,
  AnnoPulseStyleConfig,
} from '../types/annotation'

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

export const DEFAULT_STYLE: Required<AnnoPulseStyleConfig> = {
  marker: 'keyword',
  color: '#ffffff',
  backgroundColor: '#6f42c1',
  border: '1px solid transparent',
  borderRadius: '3px',
  overviewRulerColor: '#6f42c1',
}

export const DEFAULT_ANNOPULSE_RULES: readonly AnnoPulseRuleConfig[] = [
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
import {
  DEFAULT_ANNOPULSE_RULES,
  DEFAULT_STYLE,
} from '../../constants/defaults'
import type {
  AnnoPulseMessageConfig,
  AnnoPulseRuleConfig,
  CompiledAnnoPulseRule,
  NormalizedRuleResult,
} from '../../types/annotation'

const DEFAULT_MESSAGE_MODE: Required<AnnoPulseMessageConfig> = {
  mode: 'lineRest',
  group: 'message',
  trim: true,
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildTextPattern(rule: AnnoPulseRuleConfig): string {
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

function compileRule(rule: AnnoPulseRuleConfig): CompiledAnnoPulseRule {
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
  customRules: readonly AnnoPulseRuleConfig[],
): NormalizedRuleResult {
  const mergedRules = new Map<string, AnnoPulseRuleConfig>()
  const errors: NormalizedRuleResult['errors'] = []

  for (const rule of DEFAULT_ANNOPULSE_RULES) {
    mergedRules.set(rule.id, rule)
  }

  for (const rule of customRules) {
    mergedRules.set(rule.id, rule)
  }

  const rules: CompiledAnnoPulseRule[] = []

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
rtk git commit -m "feat: add annotation rule model"
```

Expected: commit succeeds.

## Task 3: Matchers, Comment Ranges, and Pure Document Scanning

**Files:**

- Create: `src/core/scanner/comment-ranges.ts`
- Create: `src/core/scanner/scan-document.ts`
- Create: `tests/comment-ranges.test.ts`
- Create: `tests/scan-document.test.ts`

**Interfaces:**

- Consumes: `CompiledAnnoPulseRule`, `AnnoPulseAnnotation`, `SerializedRange` from Task 2.
- Produces function `getCommentRanges(text: string, languageId: string): readonly OffsetRange[]`.
- Produces function `scanDocument(options: ScanDocumentOptions): AnnoPulseScanResult`.
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
  AnnoPulseAnnotation,
  CompiledAnnoPulseRule,
  SerializedPosition,
  SerializedRange,
} from '../../types/annotation'

export interface AnnoPulseSkipReason {
  readonly reason: 'maxFileSize'
  readonly message: string
}

export interface AnnoPulseScanResult {
  readonly uri: string
  readonly languageId: string
  readonly annotations: readonly AnnoPulseAnnotation[]
  readonly skipped?: AnnoPulseSkipReason
  readonly durationMs: number
}

export interface ScanDocumentOptions {
  readonly text: string
  readonly languageId: string
  readonly uri: string
  readonly source: AnnoPulseAnnotation['source']
  readonly rules: readonly CompiledAnnoPulseRule[]
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
  rule: CompiledAnnoPulseRule,
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
): AnnoPulseAnnotation[] {
  const annotations: AnnoPulseAnnotation[] = []
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

export function scanDocument(
  options: ScanDocumentOptions,
): AnnoPulseScanResult {
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
rtk git commit -m "feat: scan annotations"
```

Expected: commit succeeds.

## Task 4: Annotation Store and Range Utilities

**Files:**

- Create: `src/core/store/annotation-store.ts`
- Create: `src/utils/ranges.ts`
- Create: `tests/annotation-store.test.ts`

**Interfaces:**

- Consumes: `AnnoPulseAnnotation` from Task 2.
- Produces singleton `annotationStore`.
- Produces methods: `setForUri(uri: string, annotations: readonly AnnoPulseAnnotation[]): void`, `getAll(): readonly AnnoPulseAnnotation[]`, `getForUri(uri: string): readonly AnnoPulseAnnotation[]`, `clear(): void`, `subscribe(listener: AnnotationStoreListener): () => void`.
- Produces utility `formatAnnoPulseLink(annotation: AnnoPulseAnnotation): string`.

- [ ] **Step 1: Write failing store tests**

Create `tests/annotation-store.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createAnnotationStore } from '../src/core/store/annotation-store'
import { formatAnnoPulseLink } from '../src/utils/ranges'
import type { AnnoPulseAnnotation } from '../src/types/annotation'

function createAnnotation(
  id: string,
  uri = 'file:///workspace/src/a.ts',
): AnnoPulseAnnotation {
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
    expect(formatAnnoPulseLink(createAnnotation('a'))).toBe(
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
import type { AnnoPulseAnnotation } from '../../types/annotation'

export type AnnotationStoreListener = () => void

export interface AnnotationStore {
  setForUri(uri: string, annotations: readonly AnnoPulseAnnotation[]): void
  getForUri(uri: string): readonly AnnoPulseAnnotation[]
  getAll(): readonly AnnoPulseAnnotation[]
  clear(): void
  subscribe(listener: AnnotationStoreListener): () => void
}

export function createAnnotationStore(): AnnotationStore {
  const byUri = new Map<string, readonly AnnoPulseAnnotation[]>()
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
import type { AnnoPulseAnnotation, SerializedRange } from '../types/annotation'

export function toVscodeRange(range: SerializedRange): Range {
  return new VscodeRange(
    range.start.line,
    range.start.character,
    range.end.line,
    range.end.character,
  )
}

export function formatAnnoPulseLink(annotation: AnnoPulseAnnotation): string {
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
- Create: `src/composables/use-annotation-highlight.ts`
- Modify: `src/index.ts`
- Create: `tests/decoration-type-cache.test.ts`

**Interfaces:**

- Consumes: `normalizeRules`, `scanDocument`, `annotationStore`, `toVscodeRange`.
- Produces composable `useAnnoPulseHighlight(): void`.
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
import type { AnnoPulseStyleConfig } from '../types/annotation'

function createKey(
  ruleId: string,
  style: Required<AnnoPulseStyleConfig>,
): string {
  return JSON.stringify({ ruleId, style })
}

export class DecorationTypeCache {
  private readonly cache = new Map<string, TextEditorDecorationType>()

  public getOrCreate(
    ruleId: string,
    style: Required<AnnoPulseStyleConfig>,
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
import type {
  AnnoPulseAnnotation,
  CompiledAnnoPulseRule,
} from '../types/annotation'
import { toVscodeRange } from '../utils/ranges'

export function applyAnnoPulseDecorations(
  editor: TextEditor,
  cache: DecorationTypeCache,
  annotations: readonly AnnoPulseAnnotation[],
  rules: readonly CompiledAnnoPulseRule[],
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

Create `src/composables/use-annotation-highlight.ts`:

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
import { applyAnnoPulseDecorations } from '../decorations/apply-decorations'
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
        applyAnnoPulseDecorations(
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

export function useAnnoPulseHighlight() {
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
import { useAnnoPulseHighlight } from './composables/use-annotation-highlight'
import { logger } from './utils/logger'

const { activate, deactivate } = defineExtension(() => {
  logger.info(`Activated, version: ${version}`)

  useAnnoPulseHighlight()
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
rtk git add src/utils/editor-filter.ts src/decorations/decoration-type-cache.ts src/decorations/apply-decorations.ts src/composables/use-annotation-highlight.ts src/index.ts tests/decoration-type-cache.test.ts
rtk git commit -m "feat: highlight visible annotations"
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

- Consumes: `annotationStore`, `formatAnnoPulseLink`, generated `commands`.
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
import type { AnnoPulseAnnotation } from '../src/types/annotation'

const annotation: AnnoPulseAnnotation = {
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
import type { AnnoPulseAnnotation } from '../types/annotation'
import { formatAnnoPulseLink } from '../utils/ranges'

export function formatAnnotationsAsMarkdown(
  annotations: readonly AnnoPulseAnnotation[],
): string {
  return annotations
    .map(
      annotation =>
        `- [${annotation.severity}] ${annotation.keyword.replace(/:$/, '')} ${formatAnnoPulseLink(annotation)} - ${annotation.message}`,
    )
    .join('\n')
}

export function formatAnnotationsAsJson(
  annotations: readonly AnnoPulseAnnotation[],
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
  annotations: readonly AnnoPulseAnnotation[],
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
  annotations: readonly AnnoPulseAnnotation[],
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
    `Copied ${annotations.length} annotations as ${format}.`,
  )
}

export async function writeExportedAnnotations(
  annotations: readonly AnnoPulseAnnotation[],
  format: 'markdown' | 'json' | 'csv',
) {
  const extension = format === 'json' ? 'json' : format === 'csv' ? 'csv' : 'md'
  const target = await window.showSaveDialog({
    defaultUri: Uri.file(`annopulse.${extension}`),
    filters: {
      'AnnoPulse Export': [extension],
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
import type { AnnoPulseAnnotation } from '../types/annotation'
import { formatAnnoPulseLink, toVscodeRange } from '../utils/ranges'

export async function revealAnnotation(annotation: AnnoPulseAnnotation) {
  const document = await workspace.openTextDocument(Uri.parse(annotation.uri))
  const editor = await window.showTextDocument(document)
  const range = toVscodeRange(annotation.range)
  editor.selection = new Selection(range.start, range.end)
  editor.revealRange(range)
}

export async function copyAnnotationLink(annotation: AnnoPulseAnnotation) {
  await env.clipboard.writeText(formatAnnoPulseLink(annotation))
}

export async function copyAnnotationMarkdown(annotation: AnnoPulseAnnotation) {
  await env.clipboard.writeText(
    `- [${annotation.severity}] ${annotation.keyword.replace(/:$/, '')} ${formatAnnoPulseLink(annotation)} - ${annotation.message}`,
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
import type { AnnoPulseAnnotation } from '../types/annotation'

function firstAnnotation(value: unknown): AnnoPulseAnnotation | undefined {
  if (value && typeof value === 'object' && 'id' in value) {
    return value as AnnoPulseAnnotation
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

Modify `src/index.ts` to call `useCommands()` before `useAnnoPulseHighlight()`:

```ts
import { defineExtension } from 'reactive-vscode'
import { version } from '../package.json'
import { useCommands } from './commands'
import { useAnnoPulseHighlight } from './composables/use-annotation-highlight'
import { logger } from './utils/logger'

const { activate, deactivate } = defineExtension(() => {
  logger.info(`Activated, version: ${version}`)

  useCommands()
  useAnnoPulseHighlight()
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
rtk git commit -m "feat: add annotation commands and export"
```

Expected: commit succeeds.

## Task 7: TreeView Provider

**Files:**

- Create: `src/providers/tree-data-provider.ts`
- Create: `src/composables/use-annotation-tree.ts`
- Modify: `src/index.ts`
- Create: `tests/tree-data-provider.test.ts`

**Interfaces:**

- Consumes: `annotationStore`, `AnnoPulseAnnotation`.
- Produces class `AnnoPulseTreeDataProvider implements TreeDataProvider<AnnoPulseTreeItem>`.
- Produces composable `useAnnoPulseTree(): void`.

- [ ] **Step 1: Write provider test**

Create `tests/tree-data-provider.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import type * as Vscode from 'vscode'
import type { AnnoPulseAnnotation } from '../src/types/annotation'

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

function annotation(id: string, uri: string): AnnoPulseAnnotation {
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

describe('AnnoPulseTreeDataProvider', () => {
  it('groups annotations by file', async () => {
    const { createAnnotationStore } =
      await import('../src/core/store/annotation-store')
    const { AnnoPulseTreeDataProvider } =
      await import('../src/providers/tree-data-provider')
    const store = createAnnotationStore()
    store.setForUri('file:///workspace/src/a.ts', [
      annotation('a', 'file:///workspace/src/a.ts'),
    ])

    const provider = new AnnoPulseTreeDataProvider(store, 'file')
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
import type { AnnoPulseAnnotation } from '../types/annotation'

export type AnnoPulseTreeGroupBy =
  'file' | 'rule' | 'category' | 'severity' | 'owner' | 'flat'

export type AnnoPulseTreeItem =
  | {
      readonly kind: 'group'
      readonly label: string
      readonly annotations: readonly AnnoPulseAnnotation[]
    }
  | {
      readonly kind: 'annotation'
      readonly label: string
      readonly annotation: AnnoPulseAnnotation
    }

export class AnnoPulseTreeDataProvider implements TreeDataProvider<AnnoPulseTreeItem> {
  private readonly changeEmitter = new EventEmitter<
    AnnoPulseTreeItem | undefined
  >()

  public readonly onDidChangeTreeData: Event<AnnoPulseTreeItem | undefined> =
    this.changeEmitter.event

  public constructor(
    private readonly store: AnnotationStore,
    private readonly groupBy: AnnoPulseTreeGroupBy,
  ) {
    this.store.subscribe(() => this.refresh())
  }

  public refresh() {
    this.changeEmitter.fire(undefined)
  }

  public getTreeItem(item: AnnoPulseTreeItem): TreeItem {
    const treeItem = new TreeItem(item.label)

    if (item.kind === 'group') {
      treeItem.collapsibleState = TreeItemCollapsibleState.Expanded
      treeItem.description = `${item.annotations.length}`
      treeItem.iconPath = new ThemeIcon('folder')
      return treeItem
    }

    treeItem.collapsibleState = TreeItemCollapsibleState.None
    treeItem.contextValue = 'annotation'
    treeItem.description = `${item.annotation.line + 1}:${item.annotation.column + 1}`
    treeItem.iconPath = new ThemeIcon('bookmark')
    treeItem.command = {
      command: 'annopulse.reveal',
      title: 'Reveal Annotation',
      arguments: [item.annotation],
    }

    return treeItem
  }

  public getChildren(item?: AnnoPulseTreeItem): AnnoPulseTreeItem[] {
    if (item?.kind === 'group') {
      return item.annotations.map(annotation => ({
        kind: 'annotation',
        label: `${annotation.keyword} ${annotation.message}`.trim(),
        annotation,
      }))
    }

    if (item?.kind === 'annotation') {
      return []
    }

    const annotations = this.store.getAll()
    if (this.groupBy === 'flat') {
      return annotations.map(annotation => ({
        kind: 'annotation',
        label: `${annotation.keyword} ${annotation.message}`.trim(),
        annotation,
      }))
    }

    const groups = new Map<string, AnnoPulseAnnotation[]>()
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

Create `src/composables/use-annotation-tree.ts`:

```ts
import { watch } from 'reactive-vscode'
import { window } from 'vscode'
import { config } from '../config'
import { annotationStore } from '../core/store/annotation-store'
import { AnnoPulseTreeDataProvider } from '../providers/tree-data-provider'

export function useAnnoPulseTree() {
  const provider = new AnnoPulseTreeDataProvider(
    annotationStore,
    config.explorer.groupBy,
  )

  window.createTreeView('annopulse.annotations', {
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
import { useAnnoPulseHighlight } from './composables/use-annotation-highlight'
import { useAnnoPulseTree } from './composables/use-annotation-tree'
import { logger } from './utils/logger'

const { activate, deactivate } = defineExtension(() => {
  logger.info(`Activated, version: ${version}`)

  useCommands()
  useAnnoPulseHighlight()
  useAnnoPulseTree()
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
rtk git add src/providers/tree-data-provider.ts src/composables/use-annotation-tree.ts src/index.ts tests/tree-data-provider.test.ts
rtk git commit -m "feat: add annotation explorer"
```

Expected: commit succeeds.

## Task 8: Problems Diagnostics Provider

**Files:**

- Create: `src/providers/diagnostics.ts`
- Create: `src/composables/use-annotation-diagnostics.ts`
- Modify: `src/index.ts`
- Create: `tests/diagnostics.test.ts`

**Interfaces:**

- Consumes: `annotationStore`, `toVscodeRange`, `config.diagnostics.mode`.
- Produces function `createDiagnosticsFromAnnotations(annotations: readonly AnnoPulseAnnotation[]): Diagnostic[]`.
- Produces composable `useAnnoPulseDiagnostics(): void`.

- [ ] **Step 1: Write diagnostics test**

Create `tests/diagnostics.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import type * as Vscode from 'vscode'
import type { AnnoPulseAnnotation } from '../src/types/annotation'

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

const annotation: AnnoPulseAnnotation = {
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
  it('maps annotations to VS Code diagnostics', async () => {
    const { createDiagnosticsFromAnnotations } =
      await import('../src/providers/diagnostics')

    const diagnostics = createDiagnosticsFromAnnotations([annotation])

    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]).toMatchObject({
      message: 'FIXME: repair this',
      severity: 1,
      source: 'AnnoPulse',
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
import type {
  AnnoPulseAnnotation,
  AnnoPulseSeverity,
} from '../types/annotation'
import { toVscodeRange } from '../utils/ranges'

function toDiagnosticSeverity(severity: AnnoPulseSeverity): DiagnosticSeverity {
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
  annotations: readonly AnnoPulseAnnotation[],
): Diagnostic[] {
  return annotations.map(annotation => {
    const diagnostic = new Diagnostic(
      toVscodeRange(annotation.range),
      `${annotation.keyword} ${annotation.message}`.trim(),
      toDiagnosticSeverity(annotation.severity),
    )
    diagnostic.source = 'AnnoPulse'
    diagnostic.code = annotation.ruleId
    return diagnostic
  })
}
```

- [ ] **Step 4: Implement diagnostics composable**

Create `src/composables/use-annotation-diagnostics.ts`:

```ts
import { watch } from 'reactive-vscode'
import { languages, Uri } from 'vscode'
import { config } from '../config'
import { annotationStore } from '../core/store/annotation-store'
import { createDiagnosticsFromAnnotations } from '../providers/diagnostics'

export function useAnnoPulseDiagnostics() {
  const collection = languages.createDiagnosticCollection('annopulse')

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
import { useAnnoPulseDiagnostics } from './composables/use-annotation-diagnostics'
import { useAnnoPulseHighlight } from './composables/use-annotation-highlight'
import { useAnnoPulseTree } from './composables/use-annotation-tree'
import { logger } from './utils/logger'

const { activate, deactivate } = defineExtension(() => {
  logger.info(`Activated, version: ${version}`)

  useCommands()
  useAnnoPulseHighlight()
  useAnnoPulseTree()
  useAnnoPulseDiagnostics()
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
rtk git add src/providers/diagnostics.ts src/composables/use-annotation-diagnostics.ts src/index.ts tests/diagnostics.test.ts
rtk git commit -m "feat: add annotation diagnostics"
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
- Produces function `scanWorkspace(options: ScanWorkspaceOptions): Promise<readonly AnnoPulseAnnotation[]>`.
- Produces command behavior for `annopulse.scanWorkspace`, `annopulse.scanActiveFile`, `annopulse.scanOpenEditors`.

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
  AnnoPulseAnnotation,
  CompiledAnnoPulseRule,
} from '../../types/annotation'
import { scanDocument } from './scan-document'

export interface ScanWorkspaceOptions {
  readonly include: readonly string[]
  readonly exclude: readonly string[]
  readonly maxFilesForSearch: number
  readonly maxFileSize: number
  readonly commentOnly: boolean
  readonly rules: readonly CompiledAnnoPulseRule[]
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
): Promise<readonly AnnoPulseAnnotation[]> {
  const include = braceGlob(options.include)
  const exclude = braceGlob(options.exclude)
  const files = await workspace.findFiles(
    include,
    exclude,
    options.maxFilesForSearch,
  )
  const annotations: AnnoPulseAnnotation[] = []

  for (const uri of files) {
    annotations.push(...(await scanUri(uri, options)))
  }

  return annotations
}

async function scanUri(
  uri: Uri,
  options: ScanWorkspaceOptions,
): Promise<readonly AnnoPulseAnnotation[]> {
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
rtk git commit -m "feat: scan workspace annotations"
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
    expect(readme).toContain('# AnnoPulse')
    expect(readme).toContain('Scan Workspace for Annotations')
    expect(readme).toContain('AnnoPulse Explorer')
    expect(readme).toContain('Problems integration is off by default')
    expect(readme).toContain('VS Code Web')
  })

  it('documents core configuration keys', () => {
    expect(readme).toContain('annopulse.rules')
    expect(readme).toContain('annopulse.diagnostics.mode')
    expect(readme).toContain('annopulse.maxFilesForSearch')
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
# AnnoPulse

AnnoPulse highlights and organizes code annotations such as TODO, FIXME, BUG, NOTE, REVIEW, SECURITY, and PERF. It gives you editor highlights, a AnnoPulse Explorer, optional Problems integration, workspace scans, and export commands without requiring native tools.

## Features

- Highlight annotation keywords in visible editors.
- List annotations in the AnnoPulse Explorer.
- Scan the active file, open editors, or the workspace.
- Copy annotation links and Markdown snippets.
- Export annotations as Markdown, JSON, or CSV.
- Keep Problems integration off by default to avoid noisy workspaces.
- Support VS Code Web, Remote, and Virtual Workspaces through VS Code workspace APIs.

## Commands

<!-- commands -->

| Command                     | Title                                        |
| --------------------------- | -------------------------------------------- |
| `annopulse.enable`          | AnnoPulse: Enable AnnoPulse                  |
| `annopulse.disable`         | AnnoPulse: Disable AnnoPulse                 |
| `annopulse.toggle`          | AnnoPulse: Toggle AnnoPulse                  |
| `annopulse.refresh`         | AnnoPulse: Refresh Annotations               |
| `annopulse.scanWorkspace`   | AnnoPulse: Scan Workspace for Annotations    |
| `annopulse.scanActiveFile`  | AnnoPulse: Scan Active File for Annotations  |
| `annopulse.scanOpenEditors` | AnnoPulse: Scan Open Editors for Annotations |
| `annopulse.focusExplorer`   | AnnoPulse: Focus AnnoPulse Explorer          |
| `annopulse.reveal`          | AnnoPulse: Reveal Annotation                 |
| `annopulse.copyLink`        | AnnoPulse: Copy Annotation Link              |
| `annopulse.copyMarkdown`    | AnnoPulse: Copy Annotation as Markdown       |
| `annopulse.exportMarkdown`  | AnnoPulse: Export Annotations as Markdown    |
| `annopulse.exportJson`      | AnnoPulse: Export Annotations as JSON        |
| `annopulse.exportCsv`       | AnnoPulse: Export Annotations as CSV         |
| `annopulse.openSettings`    | AnnoPulse: Open AnnoPulse Settings           |
| `annopulse.clearCache`      | AnnoPulse: Clear AnnoPulse Cache             |

<!-- commands -->

## Configuration

The most important settings are:

- `annopulse.enable`: enable or disable AnnoPulse.
- `annopulse.rules`: custom annotation rules. Built-in rules cover TODO, FIXME, BUG, HACK, NOTE, REVIEW, SECURITY, PERF, and QUESTION.
- `annopulse.include`: workspace scan include globs.
- `annopulse.exclude`: workspace scan exclude globs.
- `annopulse.maxFileSize`: maximum document text length to scan.
- `annopulse.maxFilesForSearch`: maximum files scanned by workspace scan.
- `annopulse.commentOnly`: scan known comment ranges before falling back to full-text scanning.
- `annopulse.diagnostics.mode`: Problems integration mode. Problems integration is off by default.
- `annopulse.explorer.groupBy`: TreeView grouping mode.

Example custom rule:

```jsonc
{
  "annopulse.rules": [
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

AnnoPulse supports browser-based VS Code environments, including vscode.dev and github.dev. Runtime workspace scans use VS Code APIs instead of native ripgrep by default.

## Current MVP Limits

- Git blame and AI actions are planned follow-up features.
- Comment-only scanning uses built-in comment syntax for common languages and falls back to full-text scanning for unknown languages.
- Problems integration is opt-in through `annopulse.diagnostics.mode`.

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
rtk git commit -m "docs: prepare AnnoPulse for marketplace"
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

- `AnnoPulseAnnotation`, `AnnoPulseRuleConfig`, `CompiledAnnoPulseRule`, `SerializedRange`, `annotationStore`, `scanDocument`, `normalizeRules`, and formatter names are defined before later tasks consume them.
- Command IDs match the Task 1 `package.json` contribution list.
