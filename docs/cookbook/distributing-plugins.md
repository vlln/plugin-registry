# Cookbook：分发插件

目标：把开发好的插件交付给其他 dsh 用户。两种分发形态：**tarball**（给已集成 registry 的用户）与**社区目录模式**（给整个 registry 功能本身，与 dsh-working-activity 等社区扩展一致）。

## 形态一：tarball 分发（插件粒度）

```sh
tar -czf cool-tool.tgz -C ./cool-tool .
```

接收方安装：

```sh
dsh plugin install cool-tool.tgz
```

tarball 安装走严格解压（防路径穿越），定位到含 `dsh.plugin.json` 的插件根后按目录安装流程处理（默认禁用、索引原子写、失败回滚）。

**验证点**：打包前在本地 `dsh plugin install ./cool-tool` 通过；`tar -tzf cool-tool.tgz | head` 确认顶层含 `dsh.plugin.json`。

## 形态二：社区目录模式（registry 功能分发）

本仓库自身用此模式：把 `packages/plugin/`、`packages/ui-plugin-manager/` 复制进目标 DSH monorepo + `git apply patches/dsh-plugin-registry.patch`（基于官方 0805 快照生成）。见 [集成到 dsh](integrating-into-dsh.md)。

适配新基线：在官方新快照上重新生成补丁（文件范围 = 官方侧接线改动 + 机制件，排除复制分发包 `packages/plugin`、`packages/ui-plugin-manager` 与构建产物）：

```sh
git diff <snapshot-ref>..HEAD -- apps/cli/config/web.cordis.yml apps/cli/package.json apps/cli/src/args.ts apps/cli/src/bin.ts apps/cli/src/plugin.ts apps/cli/tests/args.spec.ts packages/client/connection packages/client/modules packages/client/runtime packages/client/test-runtime packages/client/ui-conversation packages/client/ui-question packages/client/ui-sidebar packages/client/ui-trajectory packages/client/web-react packages/host/apiproxy packages/tasks packages/README.md packages/README.zh.md packages/README.i18n.yaml scripts/verify-package-readme-model-experience.ts tsconfig.base.json tsconfig.client.json > patches/dsh-plugin-registry.patch
```

**验证点**：在干净的新快照 checkout 上 `git apply --check` 通过。

## 分发清单

- [ ] 插件在本地 `install` + `enable` 冒烟通过
- [ ] tarball 顶层含 `dsh.plugin.json`
- [ ] `engines.dsh` 与目标 dsh 版本兼容
- [ ] 补丁（若涉及）在目标基线干净应用

## 参考

- 安装/回滚机制：[architecture.md](../architecture.md#信任边界)
- 集成步骤：[集成到 dsh](integrating-into-dsh.md)
