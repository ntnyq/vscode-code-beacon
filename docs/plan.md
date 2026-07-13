# Code Beacon 产品与代码设计计划

更新时间：2026-07-08

Code Beacon 是一个面向 VS Code 的代码注释信号管理插件。它不只是高亮 TODO，而是把 TODO、FIXME、BUG、NOTE、HACK、REVIEW、SECURITY、PERF 等代码注释信号转成可扫描、可导航、可诊断、可协作、可被 AI 理解的工作流。

本文基于 `docs/vscode-task-lens-plugin-design.md`，并结合以下来源：

- [wayou/vscode-todo-highlight](https://github.com/wayou/vscode-todo-highlight) 的 issue/PR 历史：截至 2026-07-08，GitHub CLI 拉取到约 209 个 issue（100 open / 109 closed）和 60 个 PR（23 open / 16 merged / 21 closed）。
- [jgclark/vscode-todo-highlight](https://github.com/jgclark/vscode-todo-highlight) 维护版：截至 2026-07-08，约 68 个 issue（28 open / 40 closed）和 61 个 PR（5 open / 54 merged / 2 closed）。
- [ntnyq/vscode-better-color-highlight](https://github.com/ntnyq/vscode-better-color-highlight) 的 reactive-vscode、策略注册表、DecorationType 缓存、测试和配置生成架构。
- VS Code 官方 API 文档：[VS Code API](https://code.visualstudio.com/api/references/vscode-api)、[Tree View API](https://code.visualstudio.com/api/extension-guides/tree-view)、[Programmatic Language Features](https://code.visualstudio.com/api/language-extensions/programmatic-language-features)、[Language Model Tool API](https://code.visualstudio.com/api/extension-guides/ai/tools)、[Virtual Workspaces](https://code.visualstudio.com/api/extension-guides/virtual-workspaces)、[Workspace Trust](https://code.visualstudio.com/api/extension-guides/workspace-trust)。
- 同类产品亮点：[Todo Tree](https://github.com/Gruntfuggly/todo-tree)、[Better Comments](https://marketplace.visualstudio.com/items?itemName=aaron-bond.better-comments)、[Error Lens](https://github.com/usernamehw/vscode-error-lens)、[GitLens](https://marketplace.visualstudio.com/items?itemName=eamodio.gitlens)。

## 1. 产品定位

### 一句话

Code Beacon 在编辑器中标出代码里的任务、风险和上下文信号，并提供工作区级检索、Problems 集成、TreeView 管理、CodeLens 操作、Git 归因和 AI 辅助处理。

### 目标用户

- 个人开发者：快速看到遗漏的 TODO/FIXME，避免发布前忘记处理。
- 大仓库维护者：在 TreeView、Problems、导出报告中按文件、标签、严重级别、负责人和时间整理注释债务。
- 团队协作者：用 REVIEW、SECURITY、PERF、QUESTION 等注释类型表达代码中需要后续处理的信号。
- AI 辅助用户：让 VS Code Agent/Copilot 能通过 Code Beacon 工具读取当前注释任务上下文。

### 非目标

- 不做完整项目管理系统。
- 不默认把所有 TODO 塞进 Problems 造成噪声。
- 不默认依赖 native ripgrep 或 Node `fs`，以保证 VS Code Web、Remote、Virtual Workspace 可用。
- 不复制 GitLens、Todo Tree、Error Lens 的全部功能，只吸收适合 Code Beacon 的交互模式。

## 2. 从参考项目得到的关键结论

### wayou/vscode-todo-highlight

高价值需求集中在这些主题：

- 列表视图与导航：`#260 TODO LIST?`、`#241 current file list`、`#98 Activity Bar icon`、`#13 side panel`、`#35/#44/#66/#71/#121/#175 listAnnotations not working`。
- Problems 集成：`#7 Mark found items as warnings in Problems view`、`#104 user-defined Problems keywords`、`#142 put all TODOs onto Problem view`。
- Regex 与匹配准确性：`#28/#33/#73/#88/#133/#144/#181`，以及 `#48/#90/#171` 的 partial word/highlight 误匹配。
- 配置覆盖问题：`#68/#238 defaultStyle`、`#69 combine patterns and keywords`、`#83 disable built-in keywords`、`#153 user/workspace keywords simultaneously`。
- include/exclude 与性能：`#14/#17/#56/#59/#72/#141/#156/#165/#183/#213/#250`。
- 语言与平台：`#22/#23/#54/#143/#178/#233`，以及 Web/Remote PR `#149/#167/#198`，Notebook 问题 `#249/#259`。
- 视觉表达：`#16/#176 whole line`、`#60 multiline comments`、`#117 more default keywords`、`#243/#244 REVIEW annotation`。
- 设置热更新和 decoration 泄漏：PR `#258 stale highlights and settings reload` 是新插件必须从第一版规避的问题。

### jgclark/vscode-todo-highlight

维护版已经做出的改进：

- 引入 regex 关键词能力，源自 wayou PR `#152`。
- `todohighlight.keywords` 支持 `text`、`regex.pattern`、`isWholeLine`、`overviewRulerColor`、`diagnosticSeverity` 等配置。
- `todohighlight.enableDiagnostics` 支持 open files 的 Problems 诊断，且最新 README 将默认值调整为 false，说明 Problems 默认打开会产生噪声。
- include/exclude、maxFilesForSearch、Settings UI 自动补全、`.vscode-test`、`.next` 等默认排除逐步补齐。
- 源码中配置变更时会 dispose 旧 decoration types，PR `#105` 修了 before/after text duplication。
- 仍然保留 OutputChannel 列表、`workspace.findFiles + openTextDocument` 全量扫描和较旧的 JavaScript 架构，TreeView、增量索引、Notebook、Virtual Workspace、AI 工具等仍是 Code Beacon 可超越的点。

### vscode-better-color-highlight

应直接复用的架构经验：

- `defineExtension(() => useX())` 入口组合。
- `defineConfig<NestedScopedConfigs>(scopedConfigs.scope)` + `vscode-ext-gen` 生成 meta 类型。
- 每个 feature 写成 composable：例如 `useColorHighlight()`、`useColorHover()`。
- 策略注册表：根据语言与配置挑选扫描策略，避免所有逻辑堆在一个正则里。
- DecorationType 缓存：按稳定 key 复用并 dispose stale types，避免 VS Code decoration 泄漏。
- visible editors + document text + debounce + run signature + pending version，防止异步扫描结果覆盖新状态。
- 测试分层：策略单测、配置单测、workspace fs 单测、e2e smoke test。

### 同类产品亮点

- Todo Tree：使用 ripgrep 快速搜索，Activity Bar TreeView 展示结果，点击跳转，开放丰富配置。Code Beacon 应学习 TreeView 和 workspace index，但避免强依赖 ripgrep 导致 Web/Virtual Workspace 不可用。
- Better Comments：把注释分为 Alerts、Queries、TODOs、Highlights、commented out code，并允许自定义标签。Code Beacon 应提供语义 category，而不仅是关键词字符串。
- Error Lens：把 Problems 信息变成行内消息、整行背景、overview ruler。Code Beacon 的 diagnostics、inline hint、line marker 可以学习这种呈现，但默认要克制。
- GitLens：in-editor blame、hover、CodeLens、历史导航。Code Beacon 应仅做 annotation 相关 blame：作者、最后修改时间、commit、age、owner 推断。
- todo-comments.nvim：按 severity/icon/category 组织 TODO 注释，并支持搜索列表。jgclark `#111` 明确有用户想要这个方向。

## 3. 产品功能设计

### 3.1 Beacon Rule

Rule 是 Code Beacon 的核心配置单元。一个 rule 同时描述匹配方式、语义分类、视觉样式、诊断行为和操作入口。

默认内置规则：

- `todo`：`TODO` / `TODO:`，category `todo`，severity `information`
- `fixme`：`FIXME` / `FIXME:`，category `fixme`，severity `warning`
- `bug`：`BUG` / `BUG:`，category `bug`，severity `error`
- `hack`：`HACK` / `HACK:`，category `hack`，severity `warning`
- `note`：`NOTE` / `NOTE:`，category `note`，severity `hint`
- `review`：`REVIEW` / `REVIEW:`，category `review`，severity `information`
- `security`：`SECURITY` / `SECURITY:`，category `security`，severity `error`
- `perf`：`PERF` / `OPTIMIZE`，category `perf`，severity `warning`
- `question`：`QUESTION` / `ASK` / `Q:`，category `question`，severity `information`

默认规则应支持无冒号和有冒号两种形式，但提取 message 时剥离冒号与空白。

### 3.2 匹配能力

- text matcher：安全、快速、可自动 escape。
- regex matcher：高级用户可配置命名捕获组。
- whole word：默认启用，避免 `DEBUG` 命中 `BUG`、`METHODTODO` 命中 `TODO`。
- comment only：默认启用。只扫描注释区域，避免字符串、JSON value、README 示例产生误报。语言不支持时 fallback 到 full text 并记录 debug。
- multiline annotation：可选。支持 `TODO:` 后续缩进注释行合并为同一条 annotation。
- capture message：支持从匹配位置到行尾、到空行、到 block comment 结束、或 regex named group。
- owner capture：识别 `TODO(ntnyq):`、`TODO @ntnyq:`、`TODO [owner=ntnyq]`。
- due/expires capture：识别 `due:2026-08-01`、`expires:2026-08-01`。
- ignore directives：支持 `code-beacon-ignore-line`、`code-beacon-ignore-next-line`。

### 3.3 编辑器可视化

- keyword marker：仅标出关键词。
- message marker：关键词到行尾。
- line marker：整行背景。
- gutter marker：行号槽图标或颜色。
- overview ruler：滚动条标记。
- inline suffix：显示 owner、age、severity 或短消息，默认关闭。
- hover：展示 rule、message、文件位置、Git blame、命令操作。
- theme aware styles：支持 light/dark/highContrast 独立样式。
- before/after text：支持但默认关闭，并且必须通过 DecorationType 缓存和 dispose 规避重复渲染。

### 3.4 TreeView

新增 Activity Bar / Explorer view：

- View Container：`codeBeacon`
- View：`codeBeacon.annotations`
- 分组模式：
  - by file
  - by rule
  - by category
  - by severity
  - by owner
  - by age
  - flat
- 过滤器：
  - scope：workspace / active file / open editors / changed files
  - category
  - severity
  - owner
  - text query
  - include resolved / ignored
- Tree item actions：
  - reveal
  - copy link
  - mark resolved
  - ignore
  - explain
  - generate fix
  - create issue
- Tree item metadata：
  - icon by category
  - badge by count
  - description = `line:col`
  - tooltip = message + source + git metadata

TreeView 使用 VS Code 官方 Tree View API：package contribution + `TreeDataProvider` + `window.createTreeView`。

### 3.5 Problems 集成

用 `languages.createDiagnosticCollection('code-beacon')` 管理诊断。

默认策略：

- `code-beacon.diagnostics.mode` 默认 `off`，避免污染 Problems。
- 可选值：
  - `off`
  - `openFiles`
  - `workspace`
- Diagnostic：
  - `source: "Code Beacon"`
  - `code: rule.id`
  - severity 由 rule 映射到 `DiagnosticSeverity`
  - message 默认为 `TODO: message`
  - tags 可选支持 `Unnecessary` 表示 resolved/expired stale

这满足 wayou/jgclark 多个 Problems 请求，但不重复 jgclark 默认打开 Problems 的噪声问题。

### 3.6 CodeLens

CodeLens 默认关闭，可按 rule/category 开启。

候选 CodeLens：

- `Resolve`
- `Assign`
- `Copy Link`
- `Explain`
- `Generate Fix`
- `Create Issue`
- `Show Blame`

实现：`languages.registerCodeLensProvider`。Provider 从 store 读取当前文档 annotations，不在 CodeLens 回调里重新扫描。

### 3.7 Git 集成

功能：

- hover/tree 显示最后修改作者、email、commit hash、commit summary、age。
- 筛选 stale annotations：超过 N 天未更新。
- 筛选 ownerless annotations。
- 可选 blame cache，按文件 URI + document version + line range 缓存。

实现策略：

- 优先使用 VS Code Git extension API（如果可用）。
- 受限场景再调用 `git blame --line-porcelain`，但仅在 trusted workspace + desktop extension host 中启用。
- Virtual Workspace、Web、Untrusted Workspace 中禁用 shell git，显示轻量提示。

### 3.8 AI 能力

基于 VS Code Language Model Tool API 和 Language Model API，分阶段实现。

工具：

- `code_beacon_list_annotations`：返回当前 workspace/active file/open editors 的 annotation 摘要。
- `code_beacon_explain_annotation`：解释当前 annotation 背景、风险和可能处理方式。
- `code_beacon_generate_fix`：根据 annotation 和附近代码生成候选修复。
- `code_beacon_quality_check`：识别低质量 TODO，例如无动作、无上下文、无负责人、过期。

命令：

- `code-beacon.explain`
- `code-beacon.generateFix`
- `code-beacon.createIssue`
- `code-beacon.summarizeWorkspace`

安全原则：

- AI 命令必须由用户触发。
- 不自动修改代码，生成 fix 走 `WorkspaceEdit` preview。
- 不把完整 workspace 发给模型，只发送 annotation、附近代码窗口、语言、文件路径和可选 Git metadata。

### 3.9 导出与报告

导出格式：

- Markdown
- JSON
- CSV
- SARIF-lite（后续）

导出字段：

- rule/category/severity
- message
- file/line/column
- owner
- age
- git author/commit
- resolved/ignored state

命令：

- `code-beacon.exportMarkdown`
- `code-beacon.exportJson`
- `code-beacon.exportCsv`

### 3.10 Notebook / Web / Remote / Virtual Workspace

必须支持：

- `vscode-notebook-cell` 文本文档扫描。
- `.ipynb` cell 内 TODO 高亮。
- github.dev / vscode.dev / remote repositories。
- virtual filesystem 通过 `workspace.fs` 读取，不用 Node `fs` 作为默认路径。

可选增强：

- `notebooks.registerNotebookCellStatusBarItemProvider` 显示 cell annotation count。
- TreeView 按 notebook -> cell 分组。

## 4. 命令设计

命令全部使用 `code-beacon.*`。

| Command                       | Title                         | 用途                                         |
| ----------------------------- | ----------------------------- | -------------------------------------------- |
| `code-beacon.enable`          | Enable Code Beacon            | 开启插件                                     |
| `code-beacon.disable`         | Disable Code Beacon           | 关闭插件                                     |
| `code-beacon.toggle`          | Toggle Code Beacon            | 切换开启状态                                 |
| `code-beacon.refresh`         | Refresh Beacons               | 重新扫描可见编辑器和当前索引                 |
| `code-beacon.scanWorkspace`   | Scan Workspace for Beacons    | 扫描工作区                                   |
| `code-beacon.scanActiveFile`  | Scan Active File for Beacons  | 只扫描当前文件                               |
| `code-beacon.scanOpenEditors` | Scan Open Editors for Beacons | 只扫描打开的编辑器                           |
| `code-beacon.focusExplorer`   | Focus Code Beacon Explorer    | 聚焦 TreeView                                |
| `code-beacon.reveal`          | Reveal Beacon                 | 打开文件并定位                               |
| `code-beacon.copyLink`        | Copy Beacon Link              | 复制 `file:line:column`                      |
| `code-beacon.copyMarkdown`    | Copy Beacon as Markdown       | 复制 Markdown 列表项                         |
| `code-beacon.markResolved`    | Mark Beacon Resolved          | 将 annotation 标记为已解决                   |
| `code-beacon.ignore`          | Ignore Beacon                 | 对当前行添加 ignore directive 或写入本地状态 |
| `code-beacon.clearIgnored`    | Clear Ignored Beacons         | 清除忽略状态                                 |
| `code-beacon.exportMarkdown`  | Export Beacons as Markdown    | 导出 Markdown                                |
| `code-beacon.exportJson`      | Export Beacons as JSON        | 导出 JSON                                    |
| `code-beacon.exportCsv`       | Export Beacons as CSV         | 导出 CSV                                     |
| `code-beacon.showBlame`       | Show Beacon Blame             | 展示 blame 信息                              |
| `code-beacon.explain`         | Explain Beacon                | AI 解释                                      |
| `code-beacon.generateFix`     | Generate Beacon Fix           | AI 生成修复                                  |
| `code-beacon.createIssue`     | Create Issue from Beacon      | 创建 issue 草稿或复制 issue body             |
| `code-beacon.openSettings`    | Open Code Beacon Settings     | 打开配置                                     |
| `code-beacon.clearCache`      | Clear Code Beacon Cache       | 清理扫描与 blame 缓存                        |

## 5. 配置设计

配置仍由 `vscode-ext-gen --scope=code-beacon` 生成类型，运行时代码使用 `config.xxx`。

### 5.1 顶层配置

```jsonc
{
  "code-beacon.enable": true,
  "code-beacon.debug": false,
  "code-beacon.languages": ["*"],
  "code-beacon.rules": [],
  "code-beacon.include": ["**/*"],
  "code-beacon.exclude": [
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
  "code-beacon.respectFilesExclude": true,
  "code-beacon.respectSearchExclude": true,
  "code-beacon.respectGitignore": true,
  "code-beacon.maxFileSize": 1000000,
  "code-beacon.maxFilesForSearch": 5000,
  "code-beacon.scanMode": "visibleEditors",
  "code-beacon.commentOnly": true,
  "code-beacon.decorations.enabled": true,
  "code-beacon.diagnostics.mode": "off",
  "code-beacon.explorer.enabled": true,
  "code-beacon.explorer.groupBy": "file",
  "code-beacon.codelens.enabled": false,
  "code-beacon.hover.enabled": true,
  "code-beacon.git.enabled": false,
  "code-beacon.git.staleDays": 90,
  "code-beacon.ai.enabled": false,
  "code-beacon.export.defaultFormat": "markdown",
}
```

### 5.2 Rule 配置示例

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
        "caseSensitive": false,
        "wholeWord": true,
        "colon": "optional",
      },
      "message": {
        "mode": "lineRest",
        "trim": true,
      },
      "severity": "error",
      "commentOnly": true,
      "languages": ["*"],
      "style": {
        "marker": "keyword",
        "color": "#ffffff",
        "backgroundColor": "#d1242f",
        "border": "1px solid #d1242f",
        "borderRadius": "3px",
        "overviewRulerColor": "#d1242f",
        "gutterIcon": "shield",
      },
      "diagnostics": {
        "enabled": true,
        "severity": "error",
      },
      "codelens": {
        "enabled": true,
        "actions": ["explain", "createIssue"],
      },
    },
    {
      "id": "todo-owner",
      "label": "TODO with owner",
      "category": "todo",
      "matcher": {
        "type": "regex",
        "pattern": "\\bTODO\\((?<owner>[^)]+)\\):?\\s*(?<message>.*)$",
        "flags": "i",
      },
      "message": {
        "mode": "group",
        "group": "message",
      },
      "owner": {
        "mode": "group",
        "group": "owner",
      },
      "severity": "information",
      "commentOnly": true,
    },
  ],
}
```

### 5.3 配置枚举

```ts
type BeaconCategory =
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

type BeaconSeverity = 'hint' | 'information' | 'warning' | 'error'

type ScanMode = 'visibleEditors' | 'openEditors' | 'workspace' | 'manual'

type DiagnosticsMode = 'off' | 'openFiles' | 'workspace'

type ExplorerGroupBy =
  'file' | 'rule' | 'category' | 'severity' | 'owner' | 'age' | 'flat'
```

## 6. 核心类型设计

```ts
export interface BeaconRule {
  readonly id: string
  readonly label: string
  readonly category: BeaconCategory
  readonly enabled: boolean
  readonly matcher: BeaconMatcher
  readonly message?: BeaconMessageSpec
  readonly owner?: BeaconCaptureSpec
  readonly due?: BeaconCaptureSpec
  readonly severity: BeaconSeverity
  readonly commentOnly?: boolean
  readonly languages?: readonly string[]
  readonly include?: readonly string[]
  readonly exclude?: readonly string[]
  readonly style?: BeaconStyle
  readonly diagnostics?: BeaconDiagnosticsSpec
  readonly codelens?: BeaconCodeLensSpec
  readonly hideFromTree?: boolean
}

export type BeaconMatcher = BeaconTextMatcher | BeaconRegexMatcher

export interface BeaconTextMatcher {
  readonly type: 'text'
  readonly value: string
  readonly caseSensitive?: boolean
  readonly wholeWord?: boolean
  readonly colon?: 'required' | 'optional' | 'forbidden'
}

export interface BeaconRegexMatcher {
  readonly type: 'regex'
  readonly pattern: string
  readonly flags?: string
}

export interface BeaconAnnotation {
  readonly id: string
  readonly ruleId: string
  readonly category: BeaconCategory
  readonly severity: BeaconSeverity
  readonly uri: string
  readonly range: SerializedRange
  readonly keywordRange: SerializedRange
  readonly messageRange?: SerializedRange
  readonly line: number
  readonly column: number
  readonly keyword: string
  readonly message: string
  readonly owner?: string
  readonly due?: string
  readonly source: 'visibleEditor' | 'openEditor' | 'workspace' | 'notebook'
  readonly languageId: string
  readonly git?: BeaconGitInfo
  readonly ignored?: boolean
  readonly resolved?: boolean
  readonly createdAt?: string
  readonly updatedAt?: string
}

export interface BeaconScanResult {
  readonly uri: string
  readonly version?: number
  readonly languageId: string
  readonly annotations: readonly BeaconAnnotation[]
  readonly skipped?: BeaconSkipReason
  readonly durationMs: number
}

export interface BeaconGitInfo {
  readonly authorName?: string
  readonly authorEmail?: string
  readonly commit?: string
  readonly summary?: string
  readonly committedAt?: string
  readonly ageDays?: number
}
```

## 7. 代码架构

目标是沿用 `vscode-better-color-highlight` 的轻量模块化风格。

```txt
src/
  index.ts
  config.ts
  meta.ts
  constants/
    commands.ts
    defaults.ts
    languages.ts
  types/
    annotation.ts
    config.ts
    scanner.ts
    tree.ts
  core/
    rules/
      defaults.ts
      normalize.ts
      validate.ts
    scanner/
      scan-document.ts
      scan-workspace.ts
      scanner-registry.ts
      text-matcher.ts
      regex-matcher.ts
      comment-ranges.ts
      notebook.ts
    store/
      annotation-store.ts
      ignored-store.ts
      scan-state.ts
    git/
      blame.ts
      git-api.ts
      cache.ts
  decorations/
    decoration-type-cache.ts
    marker-types.ts
    apply-decorations.ts
  providers/
    tree-data-provider.ts
    codelens-provider.ts
    hover-provider.ts
    diagnostics.ts
  commands/
    index.ts
    scan.ts
    navigation.ts
    clipboard.ts
    resolve.ts
    export.ts
    ai.ts
  composables/
    use-beacon-highlight.ts
    use-beacon-workspace-index.ts
    use-beacon-tree.ts
    use-beacon-diagnostics.ts
    use-beacon-codelens.ts
    use-beacon-hover.ts
    use-beacon-git.ts
    use-beacon-ai.ts
  utils/
    editor-filter.ts
    glob.ts
    ranges.ts
    uri.ts
    logger.ts
```

入口：

```ts
const { activate, deactivate } = defineExtension(() => {
  logger.info(`Activated, version: ${version}`)

  useCommands()
  useBeaconHighlight()
  useBeaconWorkspaceIndex()
  useBeaconTree()
  useBeaconDiagnostics()
  useBeaconCodeLens()
  useBeaconHover()
  useBeaconGit()
  useBeaconAi()
})
```

## 8. 扫描设计

### 8.1 可见编辑器扫描

沿用 better-color-highlight 的模式：

- `useVisibleTextEditors()`
- `useDocumentText(doc)`
- debounce 100-150ms
- 生成 run signature：document version/text revision + languageId + normalized rules + relevant config
- `pendingVersion` 防止旧异步结果回写
- per-editor `DecorationTypeCache`
- editor 不可见时清理 state 和 decoration

### 8.2 工作区扫描

默认 portable provider：

- `workspace.findFiles(include, exclude, maxFilesForSearch)`
- `workspace.fs.readFile(uri)` 或 `workspace.openTextDocument(uri)`
- 适用于 Web、Remote、Virtual Workspace

可选 fast provider：

- trusted desktop workspace 中可选 `ripgrep`。
- 如果 native rg 不可用，自动 fallback，不报错打断用户。
- Todo Tree 的近期 issue 中反复出现 ripgrep 找不到、Virtual Workspace 不支持的问题，因此 Code Beacon 不能把 rg 作为唯一路径。

### 8.3 Ignore engine

合并来源：

- `code-beacon.exclude`
- `code-beacon.include`
- `files.exclude`
- `search.exclude`
- `.gitignore`（trusted workspace 下读取）
- 默认排除目录
- per-rule include/exclude

输出：

- `shouldScanUri(uri, rule?)`
- `getSkipReason(uri)`

### 8.4 Comment-only 策略

公共 VS Code API 不直接提供所有语言的 comment token range。实现应分层：

1. 内置语言 comment delimiters：JS/TS/CSS/HTML/Markdown/Python/Go/Rust/Java/C/C++/Shell/YAML/TOML 等。
2. Notebook cell 使用 cell document languageId。
3. 未知语言 fallback full text，并在 debug 输出原因。
4. 后续可研究 TextMate tokenization 或 tree-sitter，但 MVP 不把它作为硬依赖。

## 9. package.json contributes 设计

### 9.1 activationEvents

```jsonc
["onStartupFinished"]
```

### 9.2 views

```jsonc
{
  "viewsContainers": {
    "activitybar": [
      {
        "id": "codeBeacon",
        "title": "Code Beacon",
        "icon": "res/icon.png",
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
}
```

### 9.3 menus

- `view/title` for refresh, scan workspace, group by.
- `view/item/context` for reveal, copy link, mark resolved, ignore, explain.
- `editor/context` for current annotation actions.
- `commandPalette` with `when` clauses for AI/git commands.

### 9.4 when contexts

```ts
codeBeacon.enabled
codeBeacon.hasAnnotations
codeBeacon.hasWorkspace
codeBeacon.aiAvailable
codeBeacon.gitAvailable
codeBeacon.diagnosticsEnabled
codeBeacon.activeAnnotation
```

## 10. 实现里程碑

### Phase 1：可靠 MVP

目标：比 todo-highlight 更稳定、更现代，但范围克制。

- 配置 schema：rules、include/exclude、languages、decorations、diagnostics mode。
- 默认 rules。
- visible editors 扫描。
- comment-only 基础策略。
- DecorationTypeCache。
- TreeView：workspace/active file/open editors 基础展示。
- Commands：enable/disable/toggle/refresh/scan/reveal/copyLink/focusExplorer。
- Diagnostics：openFiles/off，默认 off。
- Hover：基础信息。
- 单测：matcher、comment ranges、rule normalize、decoration cache、store。
- e2e smoke：打开 playground，确认 TODO 高亮、TreeView 有结果。

### Phase 2：工作区工作流

- [x] workspace index 和工作区扫描。
- [x] FileSystemWatcher 增量更新。
- [x] Explorer group/filter/sort，包括 scope、category、severity、owner、query 和 resolved/ignored 可见性。
- [x] export Markdown/JSON/CSV。
- [x] Problems workspace mode。
- [x] CodeLens。
- [x] 按工作区持久化的 ignored/resolved 状态。
- [x] Settings schema。
- [x] Notebook cell 支持。
- [x] 专用 Web/Virtual Workspace 自动化测试。

### Phase 3：Git 和团队协作

- [x] Git blame metadata foundation（trusted desktop hover）。
- [ ] stale/ownerless filters。
- [ ] Create Issue body generator。
- [ ] changed files scope。
- [ ] source control integration。
- [ ] richer hover and tree metadata。

### Phase 4：AI

- [ ] Language Model Tool contribution。
- [ ] explain/generate fix/summarize commands。
- [ ] TODO quality scoring。
- [ ] Workspace annotation digest。
- [ ] AI action telemetry opt-in。

## 11. 测试计划

- `tests/rules.test.ts`：默认规则、用户规则合并、无效 regex 处理。
- `tests/matchers.test.ts`：text/regex/wholeWord/colon/caseSensitive。
- `tests/comment-ranges.test.ts`：line/block/html/markdown/python/yaml。
- `tests/scan-document.test.ts`：message capture、owner、due、ignore directive。
- `tests/decoration-cache.test.ts`：同 key 复用、stale dispose。
- `tests/diagnostics.test.ts`：severity/source/code/range。
- `tests/tree-provider.test.ts`：group/filter/sort。
- `tests/workspace-scan.test.ts`：include/exclude/maxFileSize/maxFilesForSearch。
- `tests/web-compat.test.ts`：避免 Node-only API 泄漏。
- `tests/e2e/run.ts`：VS Code extension host smoke test。

## 12. 风险与取舍

- Problems 默认关闭：牺牲“开箱即 Problems”的强感知，换取低噪声。
- comment-only 不可能第一版完美覆盖所有语言：提供 fallback 和 debug，比误称精准更诚实。
- ripgrep 只做可选加速：大仓库首扫可能不如 Todo Tree 快，但 Web/Remote/Virtual Workspace 更稳。
- Git blame 成本高：默认关闭，按需、按文件、带缓存。
- AI 能力后置：先把 annotation 数据模型和 store 做扎实，再接 Language Model Tool。
- 规则配置复杂：必须提供简单默认和 Settings UI 友好 schema，避免用户一开始就读完整类型。

## 13. 第一版 package.json 建议

短期保留当前：

- `displayName`: `Code Beacon`
- `name`: `vscode-code-beacon`
- `scope`: `code-beacon`
- `main` / `browser`: `./dist/index.js`
- `extensionKind`: 建议补充 `["ui", "workspace"]`
- `capabilities.virtualWorkspaces.supported`: true
- `capabilities.untrustedWorkspaces.supported`: `"limited"`，限制 Git、AI、ripgrep、`.gitignore` 读取等能力

分类和关键词建议：

```jsonc
{
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
    "git blame",
    "ai",
  ],
}
```

## 14. 推荐的首批实现顺序

1. 先改 `package.json` 配置、命令、views，并重新生成 `src/meta.ts`。
2. 建 `types/`、`core/rules/`、`core/scanner/`，完成纯函数扫描。
3. 接入 `useBeaconHighlight()`，先只管 visible editors decoration。
4. 建 annotation store，再接 TreeView。
5. 接 diagnostics openFiles mode。
6. 加 workspace scan command 和 export。
7. 最后补 CodeLens、Git、AI。

这个顺序能让每一步都有可视结果，同时避免一开始就陷入 workspace scan、TreeView、Problems、AI 全部互相阻塞。
