# 下一代 VS Code TODO / Code Annotation 插件设计方案

## 1. 项目定位

目标不是简单重写 vscode-todo-highlight，而是设计一个现代化的 Code
Annotation Intelligence 插件。

核心方向：

-   TODO / FIXME / NOTE / BUG / HACK 等代码标记管理
-   Decoration 高亮
-   TreeView 管理
-   CodeLens 快捷操作
-   Problem Panel 集成
-   Git blame 关联
-   AI 辅助处理
-   工作区级代码任务分析

参考：

-   wayou/vscode-todo-highlight
-   jgclark/vscode-todo-highlight
-   ntnyq/vscode-better-color-highlight
-   reactive-vscode

------------------------------------------------------------------------

# 2. 现有插件分析

## vscode-todo-highlight 优点

原插件解决了核心需求：

-   根据关键词匹配代码注释
-   Decoration 高亮
-   overview ruler 显示
-   支持自定义关键词
-   支持语言级配置

jgclark
维护版本继续增强了部分功能，例如更现代的维护版本、注释扫描体验等。

------------------------------------------------------------------------

# 3. Issues / PR 有价值方向

## 3.1 默认 TODO 配置

历史问题：

部分用户安装后没有默认 TODO 高亮，需要手动配置 keywords。

优化：

默认内置：

``` json
[
 "TODO",
 "FIXME",
 "BUG",
 "HACK",
 "NOTE",
 "XXX",
 "OPTIMIZE",
 "SECURITY"
]
```

同时允许覆盖。

------------------------------------------------------------------------

## 3.2 全行高亮

用户希望：

TODO 不只是关键词，而是整行明显提示。

设计：

``` ts
interface DecorationStyle {
  keywordBackground?: string
  lineBackground?: string
  border?: string
}
```

支持：

-   keyword
-   line
-   gutter
-   overview ruler

------------------------------------------------------------------------

## 3.3 Problem Panel 集成

替代 Output Channel。

生成：

``` ts
DiagnosticCollection
```

效果：

Problems:

    TODO src/api.ts:20
    FIXME src/auth.ts:88

支持：

-   warning
-   info
-   error severity

------------------------------------------------------------------------

## 3.4 Per Language 配置

支持：

``` json
{
 "typescript": {
   "rules": []
 },

 "python": {
   "rules": []
 }
}
```

------------------------------------------------------------------------

## 3.5 exclude/include 重构

旧插件容易出现：

-   exclude 无效
-   settings.json 被扫描
-   大仓库性能问题

新设计：

ignore engine:

    .gitignore
    .vscodeignore
    配置 exclude
    默认 exclude

使用：

-   vscode.workspace.findFiles
-   ripgrep
-   glob matcher

------------------------------------------------------------------------

# 4. jgclark/vscode-todo-highlight 优化方向

相比原始版本：

## 已有价值

-   持续维护
-   修复旧版兼容问题
-   增强配置
-   增加更多语言支持

## 新插件继续提升

不要继续 Output Channel：

改：

    Annotation Explorer TreeView

结构：

    TODO Explorer

    src
     ├ api.ts
     │  └ TODO optimize request
     |
     └ auth.ts
        └ FIXME token issue

------------------------------------------------------------------------

# 5. 竞品功能借鉴

## Todo Tree

学习：

-   TreeView
-   分组
-   快速跳转
-   文件过滤

## Better Comments

学习：

-   不同颜色分类
-   注释语义

## Error Lens

学习：

-   行内 Decoration
-   Problem 集成

## GitLens

学习：

-   blame
-   commit 信息
-   历史关联

------------------------------------------------------------------------

# 6. 新插件 Feature 设计

## 基础能力

### Annotation Scanner

扫描：

    TODO
    FIXME
    NOTE
    BUG
    HACK
    SECURITY
    PERF

支持：

-   regex
-   comment token
-   tree-sitter

------------------------------------------------------------------------

## Decoration

支持：

``` ts
createTextEditorDecorationType
```

功能：

-   背景色
-   前景色
-   icon
-   gutter
-   overview ruler

------------------------------------------------------------------------

## TreeView

Command:

    annotation.showExplorer

展示所有标记。

------------------------------------------------------------------------

## Commands

建议：

    annotation.scanWorkspace

    annotation.refresh

    annotation.showExplorer

    annotation.markResolved

    annotation.open

    annotation.copyLink

    annotation.generateFix

    annotation.export

------------------------------------------------------------------------

# 7. 配置设计

``` json
{
 "annotation.enabled": true,

 "annotation.rules": [
   {
    "keyword":"TODO",
    "severity":"info",
    "color":"yellow"
   }
 ],

 "annotation.exclude":[
   "**/node_modules/**"
 ],

 "annotation.problem.enabled":true,

 "annotation.git.enabled":true
}
```

------------------------------------------------------------------------

# 8. reactive-vscode 架构

参考 vscode-better-color-highlight。

目录：

    src

    extension.ts

    core
     ├ scanner
     ├ parser
     ├ store

    features

     ├ decoration
     ├ treeview
     ├ commands
     ├ diagnostics
     ├ codelens
     ├ git

    shared
     ├ config
     ├ utils

------------------------------------------------------------------------

# 9. 核心数据模型

``` ts
interface Annotation {

 id:string

 uri:Uri

 range:Range

 keyword:string

 message:string

 severity:
  | info
  | warning
  | error

 author?:string

 createdAt?:Date

}
```

------------------------------------------------------------------------

# 10. Reactive 设计

配置：

``` ts
const config =
useConfiguration('annotation')


watch(
 ()=>config.rules,
 refresh
)
```

状态：

``` ts
const annotations =
useObservable([])
```

------------------------------------------------------------------------

# 11. Git 集成

显示：

    TODO optimize

    Author:
    ntnyq

    Commit:
    abc123

    Age:
    120 days

用于发现：

-   长期 TODO
-   无负责人 TODO
-   老旧 TODO

------------------------------------------------------------------------

# 12. AI 能力

利用 VS Code Language Model API。

功能：

右键：

    Explain TODO

    Generate Fix

    Create Commit

    Create Issue

------------------------------------------------------------------------

# 13. MVP 开发计划

## Phase 1

-   reactive-vscode 初始化
-   scanner
-   decoration
-   config
-   TreeView

## Phase 2

-   diagnostics
-   CodeLens
-   Git blame
-   export

## Phase 3

-   AI
-   dashboard
-   team workflow

------------------------------------------------------------------------

# 14. 推荐名称

推荐：

## vscode-task-lens

定位：

代码任务透镜。

覆盖：

-   TODO
-   FIXME
-   Review
-   Security
-   AI Task

------------------------------------------------------------------------

# 总结

最佳路线：

不是重新做 TODO Highlight。

而是：

    TODO Highlight
            +
    Better Comments
            +
    Error Lens
            +
    GitLens
            +
    AI Coding

形成下一代 Code Annotation Management 工具。
