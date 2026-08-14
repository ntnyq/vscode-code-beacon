# AnnoPulse 产品与代码设计计划

更新时间：2026-07-28

AnnoPulse 是一个面向 VS Code 的代码注释信号管理插件。它不只是高亮 TODO，而是把 TODO、FIXME、BUG、NOTE、HACK、REVIEW、SECURITY、PERF 等代码注释信号转成可扫描、可导航、可诊断、可协作、可被 AI 理解的工作流。

本文基于 `docs/vscode-task-lens-plugin-design.md`，并结合以下来源：

- [wayou/vscode-todo-highlight](https://github.com/wayou/vscode-todo-highlight) 的 issue/PR 历史：截至 2026-07-08，GitHub CLI 拉取到约 209 个 issue（100 open / 109 closed）和 60 个 PR（23 open / 16 merged / 21 closed）。
- [jgclark/vscode-todo-highlight](https://github.com/jgclark/vscode-todo-highlight) 维护版：截至 2026-07-08，约 68 个 issue（28 open / 40 closed）和 61 个 PR（5 open / 54 merged / 2 closed）。
- [ntnyq/vscode-better-color-highlight](https://github.com/ntnyq/vscode-better-color-highlight) 的 reactive-vscode、策略注册表、DecorationType 缓存、测试和配置生成架构。
- VS Code 官方 API 文档：[VS Code API](https://code.visualstudio.com/api/references/vscode-api)、[Tree View API](https://code.visualstudio.com/api/extension-guides/tree-view)、[Programmatic Language Features](https://code.visualstudio.com/api/language-extensions/programmatic-language-features)、[Language Model Tool API](https://code.visualstudio.com/api/extension-guides/ai/tools)、[Virtual Workspaces](https://code.visualstudio.com/api/extension-guides/virtual-workspaces)、[Workspace Trust](https://code.visualstudio.com/api/extension-guides/workspace-trust)。
- 同类产品亮点：[Todo Tree](https://github.com/Gruntfuggly/todo-tree)、[Better Comments](https://marketplace.visualstudio.com/items?itemName=aaron-bond.better-comments)、[Error Lens](https://github.com/usernamehw/vscode-error-lens)、[GitLens](https://marketplace.visualstudio.com/items?itemName=eamodio.gitlens)。

## 1. 产品定位

### 一句话

AnnoPulse 在编辑器中标出代码里的任务、风险和上下文信号，并提供工作区级检索、Problems 集成、TreeView 管理、CodeLens 操作、Git 归因和 AI 辅助处理。

### 目标用户

- 个人开发者：快速看到遗漏的 TODO/FIXME，避免发布前忘记处理。
- 大仓库维护者：在 TreeView、Problems、导出报告中按文件、标签、严重级别、负责人和时间整理注释债务。
- 团队协作者：用 REVIEW、SECURITY、PERF、QUESTION 等注释类型表达代码中需要后续处理的信号。
- AI 辅助用户：让 VS Code Agent/Copilot 能通过 AnnoPulse 工具读取当前注释任务上下文。

### 非目标

- 不做完整项目管理系统。
- 不默认把所有 TODO 塞进 Problems 造成噪声。
- 不默认依赖 native ripgrep 或 Node `fs`，以保证 VS Code Web、Remote、Virtual Workspace 可用。
- 不复制 GitLens、Todo Tree、Error Lens 的全部功能，只吸收适合 AnnoPulse 的交互模式。

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
- 仍然保留 OutputChannel 列表、`workspace.findFiles + openTextDocument` 全量扫描和较旧的 JavaScript 架构，TreeView、增量索引、Notebook、Virtual Workspace、AI 工具等仍是 AnnoPulse 可超越的点。

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

- Todo Tree：使用 ripgrep 快速搜索，Activity Bar TreeView 展示结果，点击跳转，开放丰富配置。AnnoPulse 应学习 TreeView 和 workspace index，但避免强依赖 ripgrep 导致 Web/Virtual Workspace 不可用。
- Better Comments：把注释分为 Alerts、Queries、TODOs、Highlights、commented out code，并允许自定义标签。AnnoPulse 应提供语义 category，而不仅是关键词字符串。
- Error Lens：把 Problems 信息变成行内消息、整行背景、overview ruler。AnnoPulse 的 diagnostics、inline hint、line marker 可以学习这种呈现，但默认要克制。
- GitLens：in-editor blame、hover、CodeLens、历史导航。AnnoPulse 应仅做 annotation 相关 blame：作者、最后修改时间、commit、age、owner 推断。
- todo-comments.nvim：按 severity/icon/category 组织 TODO 注释，并支持搜索列表。jgclark `#111` 明确有用户想要这个方向。

## 3. 产品功能设计

### 3.1 AnnoPulse Rule

Rule 是 AnnoPulse 的核心配置单元。一个 rule 同时描述匹配方式、语义分类、视觉样式、诊断行为和操作入口。

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
- ignore directives：支持 `annopulse-ignore-line`、`annopulse-ignore-next-line`。

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

- View Container：`annopulse`
- View：`annopulse.annotations`
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

用 `languages.createDiagnosticCollection('annopulse')` 管理诊断。

默认策略：

- `annopulse.diagnostics.mode` 默认 `off`，避免污染 Problems。
- 可选值：
  - `off`
  - `openFiles`
  - `workspace`
- Diagnostic：
  - `source: "AnnoPulse"`
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

- `annopulse_list_annotations`：返回当前 workspace/active file/open editors 的 annotation 摘要。
- `annopulse_explain_annotation`：解释当前 annotation 背景、风险和可能处理方式。
- `annopulse_generate_fix`：根据 annotation 和附近代码生成候选修复。
- `annopulse_quality_check`：识别低质量 TODO，例如无动作、无上下文、无负责人、过期。

命令：

- `annopulse.explain`
- `annopulse.generateFix`
- `annopulse.createIssue`
- `annopulse.summarizeWorkspace`

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

- `annopulse.exportMarkdown`
- `annopulse.exportJson`
- `annopulse.exportCsv`

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

命令全部使用 `annopulse.*`。

| Command                     | Title                             | 用途                                         |
| --------------------------- | --------------------------------- | -------------------------------------------- |
| `annopulse.enable`          | Enable AnnoPulse                  | 开启插件                                     |
| `annopulse.disable`         | Disable AnnoPulse                 | 关闭插件                                     |
| `annopulse.toggle`          | Toggle AnnoPulse                  | 切换开启状态                                 |
| `annopulse.refresh`         | Refresh Annotations               | 重新扫描可见编辑器和当前索引                 |
| `annopulse.scanWorkspace`   | Scan Workspace for Annotations    | 扫描工作区                                   |
| `annopulse.scanActiveFile`  | Scan Active File for Annotations  | 只扫描当前文件                               |
| `annopulse.scanOpenEditors` | Scan Open Editors for Annotations | 只扫描打开的编辑器                           |
| `annopulse.focusExplorer`   | Focus AnnoPulse Explorer          | 聚焦 TreeView                                |
| `annopulse.reveal`          | Reveal Annotation                 | 打开文件并定位                               |
| `annopulse.copyLink`        | Copy Annotation Link              | 复制 `file:line:column`                      |
| `annopulse.copyMarkdown`    | Copy Annotation as Markdown       | 复制 Markdown 列表项                         |
| `annopulse.markResolved`    | Mark AnnoPulse Resolved           | 将 annotation 标记为已解决                   |
| `annopulse.ignore`          | Ignore Annotation                 | 对当前行添加 ignore directive 或写入本地状态 |
| `annopulse.clearIgnored`    | Clear Ignored Annotations         | 清除忽略状态                                 |
| `annopulse.exportMarkdown`  | Export Annotations as Markdown    | 导出 Markdown                                |
| `annopulse.exportJson`      | Export Annotations as JSON        | 导出 JSON                                    |
| `annopulse.exportCsv`       | Export Annotations as CSV         | 导出 CSV                                     |
| `annopulse.showBlame`       | Show AnnoPulse Blame              | 展示 blame 信息                              |
| `annopulse.explain`         | Explain Annotation                | AI 解释                                      |
| `annopulse.generateFix`     | Generate Annotation Fix           | AI 生成修复                                  |
| `annopulse.createIssue`     | Create Issue from AnnoPulse       | 创建 issue 草稿或复制 issue body             |
| `annopulse.openSettings`    | Open AnnoPulse Settings           | 打开配置                                     |
| `annopulse.clearCache`      | Clear AnnoPulse Cache             | 清理扫描与 blame 缓存                        |

## 5. 配置设计

配置仍由 `vscode-ext-gen --scope=annopulse` 生成类型，运行时代码使用 `config.xxx`。

### 5.1 顶层配置

```jsonc
{
  "annopulse.enable": true,
  "annopulse.debug": false,
  "annopulse.languages": ["*"],
  "annopulse.rules": [],
  "annopulse.include": ["**/*"],
  "annopulse.exclude": [
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
  "annopulse.respectFilesExclude": true,
  "annopulse.respectSearchExclude": true,
  "annopulse.respectGitignore": true,
  "annopulse.maxFileSize": 1000000,
  "annopulse.maxFilesForSearch": 5000,
  "annopulse.scanMode": "visibleEditors",
  "annopulse.commentOnly": true,
  "annopulse.decorations.enabled": true,
  "annopulse.diagnostics.mode": "off",
  "annopulse.explorer.enabled": true,
  "annopulse.explorer.groupBy": "file",
  "annopulse.codelens.enabled": false,
  "annopulse.hover.enabled": true,
  "annopulse.git.enabled": false,
  "annopulse.git.staleDays": 90,
  "annopulse.ai.enabled": false,
  "annopulse.export.defaultFormat": "markdown",
}
```

### 5.2 Rule 配置示例

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
type AnnoPulseCategory =
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

type AnnoPulseSeverity = 'hint' | 'information' | 'warning' | 'error'

type ScanMode = 'visibleEditors' | 'openEditors' | 'workspace' | 'manual'

type DiagnosticsMode = 'off' | 'openFiles' | 'workspace'

type ExplorerGroupBy =
  'file' | 'rule' | 'category' | 'severity' | 'owner' | 'age' | 'flat'
```

## 6. 核心类型设计

```ts
export interface AnnoPulseRule {
  readonly id: string
  readonly label: string
  readonly category: AnnoPulseCategory
  readonly enabled: boolean
  readonly matcher: AnnoPulseMatcher
  readonly message?: AnnoPulseMessageSpec
  readonly owner?: AnnoPulseCaptureSpec
  readonly due?: AnnoPulseCaptureSpec
  readonly severity: AnnoPulseSeverity
  readonly commentOnly?: boolean
  readonly languages?: readonly string[]
  readonly include?: readonly string[]
  readonly exclude?: readonly string[]
  readonly style?: AnnoPulseStyle
  readonly diagnostics?: AnnoPulseDiagnosticsSpec
  readonly codelens?: AnnoPulseCodeLensSpec
  readonly hideFromTree?: boolean
}

export type AnnoPulseMatcher = AnnoPulseTextMatcher | AnnoPulseRegexMatcher

export interface AnnoPulseTextMatcher {
  readonly type: 'text'
  readonly value: string
  readonly caseSensitive?: boolean
  readonly wholeWord?: boolean
  readonly colon?: 'required' | 'optional' | 'forbidden'
}

export interface AnnoPulseRegexMatcher {
  readonly type: 'regex'
  readonly pattern: string
  readonly flags?: string
}

export interface AnnoPulseAnnotation {
  readonly id: string
  readonly ruleId: string
  readonly category: AnnoPulseCategory
  readonly severity: AnnoPulseSeverity
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
  readonly git?: AnnoPulseGitInfo
  readonly ignored?: boolean
  readonly resolved?: boolean
  readonly createdAt?: string
  readonly updatedAt?: string
}

export interface AnnoPulseScanResult {
  readonly uri: string
  readonly version?: number
  readonly languageId: string
  readonly annotations: readonly AnnoPulseAnnotation[]
  readonly skipped?: AnnoPulseSkipReason
  readonly durationMs: number
}

export interface AnnoPulseGitInfo {
  readonly authorName?: string
  readonly authorEmail?: string
  readonly commit?: string
  readonly summary?: string
  readonly committedAt?: string
  readonly ageDays?: number
}
```

## 7. 代码架构

当前实现沿用 `vscode-better-color-highlight` 的轻量模块化风格，并把纯核心逻辑、VS Code 副作用适配和生命周期组合分开。

```txt
src/
  index.ts
  config.ts
  meta.ts
  adapters/
    vscode/
      annotation-command-adapter.ts
  composables/
    use-annotation-commands.ts
    use-annotation-highlight.ts
    use-workspace-scan.ts
    use-annotation-explorer.ts
    use-annotation-diagnostics.ts
    use-annotation-codelens.ts
    use-annotation-hover.ts
    use-annotation-git.ts
    use-annotation-source-control.ts
    use-annotation-notebook.ts
    use-annotation-language-model-tools.ts
  constants/
    defaults.ts
  types/
    annotation.ts
  core/
    ai/
      action-execution.ts
      explain-annotation.ts
      generate-annotation-fix.ts
      list-annotations.ts
      quality-check.ts
      select-annotations.ts
      workspace-annotation-summary.ts
    commands/
      annotation-target.ts
      annotation-command-handlers.ts
      register-annotation-commands.ts
    codelens/
      commands.ts
    decorations/
      apply-decorations.ts
      decoration-type-cache.ts
      editor-decoration-caches.ts
    diagnostics/
      annotation-diagnostics.ts
    explorer/
      filter.ts
      git-metadata-index.ts
      tree-data-provider.ts
    export/
      format.ts
    git/
      blame.ts
      changed-uri-index.ts
      presentation.ts
    hover/
      format.ts
    issues/
      format.ts
    quality/
      score-annotations.ts
    rules/
      normalize.ts
    scanner/
      comment-ranges.ts
      configured-document-scanner.ts
      scan-document.ts
      scan-mode.ts
    source-control/
      resources.ts
    store/
      annotation-state.ts
      annotation-store.ts
    workspace/
      documents.ts
      globs.ts
  utils/
    logger.ts
    ranges.ts
```

入口：

```ts
const { activate, deactivate } = defineExtension(context => {
  useAnnoPulseCommands(context.workspaceState)
  useAnnoPulseDiagnostics()
  const annotationGit = useAnnoPulseGit()
  const changedUriIndex = createChangedUriIndex(annotationGit)
  useDisposable(changedUriIndex)
  useAnnoPulseExplorer(annotationGit, changedUriIndex)
  useWorkspaceScan()
  const annotationHighlight = useAnnoPulseHighlight()
  useAnnoPulseNotebook(annotationHighlight.scanTextDocument)
  useAnnoPulseHover(annotationGit.getMetadata)
  useAnnoPulseSourceControl(changedUriIndex)
  useAnnoPulseCodeLens()
  useAnnoPulseLanguageModelTools()
})
```

`core/` 保持可测试的领域逻辑，`adapters/vscode/` 集中命令所需的 VS Code 副作用，`composables/` 负责订阅、配置响应和资源释放，`index.ts` 只组合生命周期与共享依赖。

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
- Todo Tree 的近期 issue 中反复出现 ripgrep 找不到、Virtual Workspace 不支持的问题，因此 AnnoPulse 不能把 rg 作为唯一路径。

### 8.3 Ignore engine

合并来源：

- `annopulse.exclude`
- `annopulse.include`
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
        "id": "annopulse",
        "title": "AnnoPulse",
        "icon": "res/icon.png",
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
}
```

### 9.3 menus

- `view/title` for refresh, scan workspace, group by.
- `view/item/context` for reveal, copy link, mark resolved, ignore, explain.
- `editor/context` for current annotation actions.
- `commandPalette` with `when` clauses for AI/git commands.

### 9.4 when contexts

```ts
annopulse.enabled
annopulse.hasAnnotations
annopulse.hasWorkspace
annopulse.aiAvailable
annopulse.gitAvailable
annopulse.diagnosticsEnabled
annopulse.activeAnnotation
```

## 10. 实现里程碑

### Phase 1：可靠 MVP

目标：比 todo-highlight 更稳定、更现代，但范围克制。

- [x] 配置 schema：rules、include/exclude、languages、decorations、diagnostics mode。
- [x] 默认 rules。
- [x] visible editors 扫描。
- [x] comment-only 基础策略。
- [x] DecorationTypeCache。
- [x] TreeView：workspace/active file/open editors 基础展示。
- [x] Commands：enable/disable/toggle/refresh/scan/reveal/copyLink/focusExplorer。
- [x] Diagnostics：openFiles/off，默认 off。
- [x] Hover：基础信息。
- [x] 单测：matcher、comment ranges、rule normalize、decoration cache、store。
- [x] e2e smoke：打开 playground，确认 TODO 高亮、TreeView 有结果。

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
- [x] stale/ownerless filters。
- [x] Create Issue body generator。
- [x] changed files scope。
- [x] source control integration。
- [x] richer hover and tree metadata。

### Phase 4：AI

- [x] Language Model Tool contribution。
- [x] explain/generate fix/summarize commands。
- [x] TODO quality scoring。
- [x] Workspace annotation digest（`annopulse.summarizeWorkspace`）。
- [ ] AI action telemetry opt-in（等待项目自有遥测目标、凭据、数据保留与隐私策略；条件具备前保持无网络发送）。

### Phase 5：0.1.0 Preview 发布收口

- [x] CI 显式验证单测、Desktop Extension Host、Web/Virtual Workspace 和 VSIX 打包。
- [x] README、CHANGELOG、架构图和路线图与当前实现同步。
- [ ] 在干净 VS Code Profile 中安装 VSIX，手测 Explorer、状态持久化、Git/SCM、AI、Notebook 和 Web。
- [x] 确认 Marketplace 发布凭据与发布方式。
- [x] 升级版本并发布 `0.1.0` Preview。

### Phase 6：0.1.x 发布治理与稳定期

- [ ] 发布 `0.1.1`，使 Git tag、源码、Marketplace 包和 AnnoPulse 身份完全对齐。
- [ ] 从 tag 构建唯一 VSIX，并为 GitHub Release 附加 VSIX 和 SHA-256 校验和。
- [ ] 增加 Bug、误报/漏报、性能和功能建议 issue 模板。
- [ ] 完成 Desktop、Web、Remote 和 Virtual Workspace 的发布后安装验证。
- [ ] 建立大型工作区扫描与增量更新性能基线。
- [ ] 根据真实反馈确定 `0.2.0` 的准确性、性能和报告能力优先级。

## 11. 测试覆盖

- 扫描与规则：`rules.test.ts`、`comment-ranges.test.ts`、`scan-document.test.ts`、`configured-document-scanner.test.ts`、`scan-mode.test.ts`。
- 展示与工作流：decoration、diagnostics、CodeLens、Explorer、hover、export、issue format、Source Control。
- 状态与 Git：annotation store/state、changed URI index、blame、metadata index、Git presentation。
- AI：annotation selection、quality scoring、Language Model Tools、explain、generate fix、workspace summary、cancellation 和 latest-request-wins。
- 包元数据与生命周期：`package-metadata.test.ts`、`index.test.ts`。
- Desktop：`tests/e2e/run.ts` 打包临时 VSIX，并在真实 Extension Host 中验证激活、扫描、Explorer 和 diagnostics。
- Web/Virtual Workspace：`tests/web/run.ts` 在 Chromium browser host 中验证虚拟文件系统扫描与 diagnostics。
- CI：格式、lint、类型、构建、单测、Desktop E2E、Web E2E 和显式 VSIX 打包全部作为合并门禁。

## 12. 风险与取舍

- Problems 默认关闭：牺牲“开箱即 Problems”的强感知，换取低噪声。
- comment-only 不可能第一版完美覆盖所有语言：提供 fallback 和 debug，比误称精准更诚实。
- ripgrep 只做可选加速：大仓库首扫可能不如 Todo Tree 快，但 Web/Remote/Virtual Workspace 更稳。
- Git blame 成本高：默认关闭，按需、按文件、带缓存。
- AI 默认关闭且只由用户触发：限制共享上下文、要求工具确认，并在生成修复时使用确认式 `WorkspaceEdit`。
- 规则配置复杂：必须提供简单默认和 Settings UI 友好 schema，避免用户一开始就读完整类型。

## 13. 0.1.0 Preview 发布策略

当前发布元数据已经包含：

- `displayName`: `AnnoPulse`
- `name`: `annopulse`
- `scope`: `annopulse`
- `main`: `./dist/index.js`
- `browser`: `./dist/index.cjs`
- `extensionKind`: `["ui", "workspace"]`
- `capabilities.virtualWorkspaces.supported`: true
- `capabilities.untrustedWorkspaces.supported`: `"limited"`
- `preview`: true

首个公开预览版 `0.1.0` 已于 2026-08-14 发布到 Visual Studio Marketplace，并保留 `preview: true`。发布后仓库和扩展身份从 Code Beacon 统一为 AnnoPulse；由于 GitHub `v0.1.0` tag 早于品牌重命名提交，后续通过 `0.1.1` 重新建立源码、tag 和 Marketplace 包之间的可追溯关系。

标签触发的 GitHub workflow 负责生成 GitHub Release。发布流水线应从 tag 构建一次 VSIX，将同一产物附加到 GitHub Release，并在受保护的 release environment 配置 `VSCE_PAT` 后发布到 Marketplace。在凭据尚未迁移到 GitHub 前，可以下载流水线产物并使用本地 `vsce` 凭据发布。

## 14. 下一步实施顺序

1. 修正 `0.1.0` GitHub Release 说明，不移动或重写已经公开的 tag。
2. 改造发布流水线，从 tag 构建并保存唯一 VSIX 与 SHA-256 校验和。
3. 增加结构化反馈模板并完成发布后安装验证。
4. 发布 `0.1.1`，恢复 GitHub 源码、release artifact 和 Marketplace 包的版本一致性。
5. 进入 `0.1.x` 稳定期，优先修复缺陷并建立大型工作区性能基线。
6. 根据真实反馈决定 `0.2.0` 的性能、匹配准确性、SARIF-lite、multiline annotation 等优先级。
