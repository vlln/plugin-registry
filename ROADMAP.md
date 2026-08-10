# Roadmap

plugin-registry 的推进路线。状态标注：`待决策`（需先拍板形态）/ `暂缓`（已决定不做或延后）/ `下轮`（明确候选）。设计论证见 [官方 0809 覆盖度](docs/official-0809-coverage.md) 与 [插件类型对比](docs/plugin-types.md)（当前契约），历史机制设计见 `docs/client-ui-extension-model.md`（已转向，仅存档），本文件只列执行状态。

## 下一轮候选

| 项 | 状态 | 说明 |
|---|---|---|
| **S4 动态卡片** | 暂缓 | 基于已移除的旧机制件（ToolRow toolview 渲染缝、`conversation.view`、轮询投影通道，0809 转向后已移除）——需先按当前官方机制（entry 自渲染 / repository 插件）重评估 |
| 跨 session 全局看板 | 暂缓 | 同上，基于已移除的 `conversation.view` 机制，需重评估 |
| task-status 输出投影 | 暂缓 | 基于已移除的轮询投影通道，需重评估 |
| **agent native 插件生态管理** | 下轮 | 设计定稿（`docs/plugin-discovery-design.md`）：tool 方式 4 个 `plugin_*` 工具（search/install/uninstall/status），console Node half 注册；发现层 = `$DSH_HOME/plugin-sources/`（sources.yml 源集合 + lock.yml TOFU + cache/ 快照），index/manifest/single 三源类型，懒加载探测 + 1h 缓存防 GitHub 限流，trust 层级 + first-index 多源。实现 = console 加工具 + 存储读写 + 0810 站 agent 端到端验证 |


## 文档项（零代码）

| 项 | 状态 | 说明 |
|---|---|---|
| CSS 变量契约文档化 | 下轮 | 哪些 token 可被插件覆盖、类名契约稳定承诺（主题层） |
| `data-chat-*` 锚点属性契约化 | 下轮 | navbar 依赖的锚点属性是未版本化实现细节，需文档化为稳定契约 |

## 官方基线持续对齐

- 机制分支 `feat/plugin-registry-mvp-0808` 已冻结退役（0809 转向后不再演进）；当前基线 = 官方 0810 快照，验证站 `/tmp/dsh-0810`（薄控制台验证通过，见 CHANGELOG）

## 已决定不做（记录）

- **patch 瘦身（49 → 5）**：随 0809 转向废弃——patch 机制整体移除（0 patch 薄控制台），设计稿见 `docs/patch-slimming-design.md`（历史文档）
- **S3 turn 折叠**：区间折叠（N item → 1 折叠头）需官方折叠容器（纯折叠策略 + 原生常驻 + CSS 收起）——M2 方案已决定不做，`examples/turn-fold` 移除；早期 per-item 回退缝（`conversation.chat.item`）已随缝降级移除
- **S5 task board 委派台**：工作区级委派台（与 workspace 平级）暂不做；taskboard 示例移除
