# 开发踩过的坑（Gotchas）

领域特定事实，违反合理假设——**先读本文再动手**。每条都是插件开发实测踩过并修复的（决策记录可溯）。本文件是 SKILL.md 的深读材料。

## 1. 官方包未发布到公共 npm

`@deepseek-ai/dsh-tools`、`@deepseek-ai/dsh-repository-plugin`、`schemastery` 等依赖**在公共 npm 不存在**（官方包未发布）。`npm install` 直接失败。

- **正式分发**：走 `github:owner/repo#<ref>` 源，依赖由**官方发布环境解析**——不需要也不应该自己发布或改依赖。
- **本地验证**：symlink 至官方 monorepo 构建产物（`@deepseek-ai/dsh-tools` → 0809 monorepo 产物）或 mock npm registry（21 包闭包）——预置缓存是本地验证手段，非分发形态。
- **判断**：本地 `npm i` 失败不是你的错——不要改依赖声明，确认分发走 github: 源。

**bundle 插件同坑、更隐蔽**：bundle（dshClient 包，如 loop/task-status）同样 import `@deepseek-ai/dsh-tools`/`dsh-llm`，但 **`dependencies` 声明为空**——官方包由 profile 的 pnpm 闭包（`dsh plugin --profile web add` 挂载环境）注入。**插件不该自己声明这些依赖**：声明了公共 npm 解析不到反而失败；依赖由挂载环境提供是设计。本地装 bundle 同样需官方 monorepo 构建产物 link 进 profile。

## 1b. bundle 插件的 patch 层语义

同名 `cordis.patch.yml` 出现在**三个层**，属主不同，写错层是 bundle 特有坑：

| 层 | 位置 | 属主 | 用途 |
|---|---|---|---|
| bundle 包内 | `packages/bundle/*/cordis.patch.yml` | 产品开发者 | 定义组合行（插件声明） |
| profile 层 | `$DSH_HOME/profiles/web/cordis.patch.yml` | 用户 | 启停覆盖（`disabled` 标记） |
| home 层 | `$DSH_HOME/cordis.patch.yml` | 机器级用户 | repository 插件 repositories 列表 |

bundle 插件的**启停覆盖写 profile 层**，不要写进 bundle 包内层（产品层不该动）或 home 层（repository 用）。薄控制台读写的 repository 列表在 home 层。

## 2. 已挂载插件改源码需 web 重启（ESM 缓存）

`index.mjs`/src 改动后，disable/enable/CLI 重装**都不生效**——ESM 模块缓存按 URL 永久缓存，`mount()` 的 `import(entryUrl)` 无 query bust，同 URL 二次 import 返回旧模块。**只能 web 重启**。

- 例外：进程内**从未 import 过**的插件（禁用态启动后首次面板 enable）首次 import 即新代码，无需重启。
- 重启后日志须无 `plugin tree failed to load`。

## 3. 挂载失败排查顺序

日志 `plugin tree failed to load` 时按序查：

1. `dsh.entry` 路径指向 `.dsh-plugin/` **外** → containment 违规，安装失败
2. `scripts.prepack` 缺失/未调用 `dsh-plugin-prepare` → wrapper 未生成
3. 依赖解析失败（见坑 1）——本地验证环境缺 symlink/mock registry
4. `dsh` 字段用了 `skills`/`mcpServers`/`entry` 之外的值 → strict schema 拒绝

## 4. 宿主环境覆盖注入的 CSS

宿主全局 CSS 可能覆盖插件注入的 `<style>`（清理 style 标签或更高优先级类）。插件 UI 关键样式**用 JS 内联**（内联优先级最高，宿主无法覆盖），不要依赖 CSS class 注入。

- 实例：插件状态卡/菜单按钮曾裸文字（宿主覆盖 class），改 JS 内联修复。
- 第一次踩到就写 bug-fix 决策记录标注「环境事实」，不等第二次。

## 5. 其他已实证的环境事实

- **页面注入是插件自己的事**：官方无「第三方插件自动悬浮」机制——entry 自造注入点（httpServer 注入 `<script>` 或配置 hole）。
- **工具 schema DSL 违规在挂载时暴露**：CLI enable 只校验名称，`defineTool` value-schema 违规在 web boot/面板 enable（reconcile）时暴露——发现后重启 web 确认日志。
