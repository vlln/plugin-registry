# Cookbook：分发插件

目标：把开发好的插件交付给其他 dsh 用户。两种分发形态：**tarball**（给已集成 registry 的用户）与**社区目录模式**（给整个 registry 功能本身，与 dsh-working-activity 等社区扩展一致）。

## 形态一：tarball 分发（插件粒度）

```sh
tar -czf cool-tool.tgz -C ./cool-tool .
```

接收方安装：

```sh
dsh registry install cool-tool.tgz
```

tarball 安装走严格解压（防路径穿越），定位到含 `dsh.plugin.json` 的插件根后按目录安装流程处理（默认禁用、索引原子写、失败回滚）。

**验证点**：打包前在本地 `dsh registry install ./cool-tool` 通过；`tar -tzf cool-tool.tgz | head` 确认顶层含 `dsh.plugin.json`。

## 形态二：社区目录模式（registry 功能分发）

本仓库自身用此模式：把 `packages/plugin/`、`packages/ui-plugin-manager/` 复制进目标 DSH monorepo + `git apply patches/dsh-plugin-registry-0808.patch`（基于官方 0808 快照生成）；registry 服务经 profile bundle 挂载（`packages/bundle/dsh-plugin-registry`）。见 [集成到 dsh](integrating-into-dsh.md)。

适配新基线：在官方新快照上重新生成补丁（文件范围 = 官方侧接线改动 + 机制件，排除复制分发包 `packages/plugin`、`packages/ui-plugin-manager` 与构建产物）：

```sh
git diff <snapshot-ref>..HEAD -- apps/cli/package.json apps/cli/src/args.ts apps/cli/src/bin.ts apps/cli/src/registry.ts apps/cli/tests/args.spec.ts packages/client/connection packages/client/modules packages/client/ui-plugin-manager packages/host/apiproxy packages/tasks/tasks packages/tasks/tasks-local packages/bash/bash packages/bash/bash-local packages/bash/pwsh-local packages/bash/tool-bash packages/README.md packages/README.zh.md packages/README.i18n.yaml scripts/verify-package-readme-model-experience.ts tsconfig.base.json tsconfig.client.json > patches/dsh-plugin-registry-0808.patch
```

**验证点**：在干净的新快照 checkout 上 `git apply --check` 通过。

## 独立判定：什么插件能进 registry，需要什么迁移完整性

不是所有 Cordis 插件都能"包一层 `dsh.plugin.json` 就进 registry"。按插件与官方树的关系分三类：

### 纯工具 / 事件型（独立最干净）

只注册工具、监听事件、读服务，**不 provide 新 `ctx.xxx` 服务**。独立 = 复制包 + 清单 + 官方树无对应物。

```sh
dsh registry install ./my-tool   # 直接可用
```

示例：`examples/greeter`、`examples/loop`、dsh-tool-calculator 类。

### 服务型（可以独立，但要求"全家一起搬"）

**provide 新 `ctx.xxx` 服务**的插件（如 `ctx.workflows`、`ctx.xxx`），Cordis 的同名服务**只能有一个 provide 实例**。独立进 registry 必须同时满足：

| 条件 | 说明 |
|---|---|
| ✅ 官方树**移除原版** | 官方 cordis.yml 与 registry 不能同时挂同名服务，否则 provide 冲突（产品层边界，见 architecture.md） |
| ✅ **服务 + 消费者一起独立** | 服务实现（如 `workflow-workerthread`）+ 消费该服务的工具（如 `tool-workflow`，`inject: ['workflows']`）必须同仓搬迁，否则跨层割裂：服务来自 registry、工具还在官方树 |
| ✅ Config 全有默认值 | registry 挂载**不传 config**（`ctx.plugin(plugin)` 无 config 参数）；靠插件 `static Config` 默认值工作。Config 有必填项 → registry 方式装不上（需先支持传 config） |
| ✅ peer 依赖可解析 | `@deepseek-ai/*` 与 `cordis` 在 dsh 环境 node_modules 可用（成立） |

判断要点：**先问"这个插件 provide 什么服务名？官方树有没有同名提供者？"**——有 → 必须官方树摘除 + 全家搬迁；没有 → 单包直接独立。

### 补丁型（要改官方包才能接线）

插件本身是单包，但**管理器/接线**需要改官方包（CLI、apiproxy、client-modules、组合）。这类以**仓库形态**分发（`packages/` 复制 + `patches/`），如本仓库自身与 dsh-working-activity。见 [集成到 dsh](integrating-into-dsh.md)。

## 分发清单

- [ ] 插件在本地 `install` + `enable` 冒烟通过
- [ ] tarball 顶层含 `dsh.plugin.json`
- [ ] `engines.dsh` 与目标 dsh 版本兼容
- [ ] 补丁（若涉及）在目标基线干净应用

## 参考

- 安装/回滚机制：[architecture.md](../architecture.md#信任边界)
- 集成步骤：[集成到 dsh](integrating-into-dsh.md)
