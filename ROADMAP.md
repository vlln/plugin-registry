# Roadmap

plugin-registry 的推进路线。状态标注：`待决策`（需先拍板形态）/ `暂缓`（已决定不做或延后）/ `下轮`（明确候选）。设计论证见 `docs/client-ui-extension-model.md`（开放决策与机制件清单），本文件只列执行状态。

## 下一轮候选

| 项 | 状态 | 说明 |
|---|---|---|
| **S4 动态卡片** | 待决策 | marker 识别（新 AssistantBlock kind vs fence 约定）+ keyed 渲染缝（有 slots 的层）。渲染缝有 ToolRow toolview 先例；marker 方案需拍板 |
| 跨 session 全局看板 | 待决策 | 需 root 级视图环（现 `conversation.view` 是 session 作用域）；S5 委派台（工作区级）暂缓后，此作为同类工作区级机制件评估 |
| task-status 输出投影 | 下轮 | 轮询通道当前投影状态不含输出流（`task_output` 读取结果）——详情展示可增强 |
| **agent native 插件生态管理** | 待决策 | agent 原生方式管理插件生态：依赖分析（读插件 package.json/dsh 字段）、兼容性检查（对照官方契约/已知坑）、修复建议（gotchas 映射）、按任务推荐插件组合（读 hub 索引）——形态待拍板（独立 skill vs make-dsh-plugin references 扩展） |
| **patch 瘦身（49 → 5）** | 下轮 | 设计稿已定稿（`docs/patch-slimming-design.md`）：A/B/C 类 44 文件转分发包，patch 收敛为 D 类硬接线（CLI + `registerExternal`）。实施 = 机制分支移文件 + 重建 patch + 验证站验证，能力零下降 |

## 文档项（零代码）

| 项 | 状态 | 说明 |
|---|---|---|
| CSS 变量契约文档化 | 下轮 | 哪些 token 可被插件覆盖、类名契约稳定承诺（主题层） |
| `data-chat-*` 锚点属性契约化 | 下轮 | navbar 依赖的锚点属性是未版本化实现细节，需文档化为稳定契约 |

## 官方基线持续对齐

- worktree 分支随官方快照推进（已对齐 08-05）；后续官方快照发布时评估对齐（冲突面集中于我们改过的官方包：apiproxy/client-modules/cli）

## 已决定不做（记录）

- **S3 turn 折叠**：区间折叠（N item → 1 折叠头）需官方折叠容器（纯折叠策略 + 原生常驻 + CSS 收起）——M2 方案已决定不做，`examples/turn-fold` 移除；早期 per-item 回退缝（`conversation.chat.item`）已随缝降级移除
- **S5 task board 委派台**：工作区级委派台（与 workspace 平级）暂不做；taskboard 示例移除
