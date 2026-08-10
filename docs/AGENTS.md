# AGENTS.md — 文档标准

本文定义 plugin-registry 的文档分层、写作规则与字数预算，参考 DeepSeek Harness 文档系统按独立仓库规模裁剪。**每个事实只有一个家**，其他位置链接到那个家。

## 分层：one home per fact

| 层 | 职责 | 不该放这里 |
|---|---|---|
| 根 `AGENTS.md` | 项目导览：仓库定位（0 patch 薄控制台 + 开发引导）、双仓库格局、协作约束 | 文档写作规则（→ 本文）、机制细节（→ 当前契约文档） |
| 根 `README.md` | 产品入口：是什么、截图、快速上手、指向各文档 | 深度机制（→ 当前契约文档）、分步操作（→ cookbook/） |
| [`docs/architecture.md`](architecture.md) | **历史文档（2026-08 转向后）**：旧两层插件模型的系统地图，仅存档 | 当前机制描述（→ plugin-types / official-0809-coverage） |
| [`docs/cookbook/`](cookbook/) | 分步操作指南，带可验证步骤 | 设计理由（→ 设计文档） |
| 包 README（`packages/*/*/README*.md`） | 每包契约：配置、语义、限制、扩展点 | 其他包的关注点、跨文档重复 |
| `skills/`、`examples/` | 可复用工作流、可运行示例 | 产品与运行时契约（→ docs 或源码） |

## 写作规则

- **写当前状态，不写变更史**：避免"之前/现在/不再"、PR 与提交号；变更故事留在提交信息。
- **一段一行**：物理行每段一行（编辑器软换行），表格、代码块、列表保持结构。
- **中文为默认语言**：术语首次出现给英文原名，如「清单（manifest）」。
- **保持完整命题**：行为、条件、模态（必须/不得）、否定保证、例外、后果——删形容词与重复，不删事实。
- **非平凡变更同步更新受影响文档**：改机制必改 `architecture.md`，改流程必改对应 cookbook。
- **链接可解析**：`verify-md-links` 校验；移动文档时同一次变更里修所有入链。

## 字数预算

[`scripts/doc-budgets.manifest.json`](../scripts/doc-budgets.manifest.json) 设定常驻文档上限（去除空白后的字符数）；`node scripts/verify-doc-budgets.mjs` 校验。门禁变红时：**搬迁**（内容属另一层 → 移走留链接）→ **压缩**（属本层但可更短）→ **上调**（确需空间才调，在 manifest 差异说明理由）。

上限是护栏不是压缩目标：至少保留 5% 余量。目标：本文 ≤ 1,400 字符；`architecture.md` ≤ 6,000；每篇 cookbook ≤ 3,500；根 `README.md` ≤ 4,500。

## Slop 清单（写作时自查）

- ❌ 叙述变更历史（除非对照仍存在的活机制）、重复他文事实（→ 链接）、手写目录、控制流叙述、测试走查
- ✅ 保留：非显然契约、失败模式、安全边界、维护陷阱

## 验证

```sh
node scripts/verify-md-links.mjs       # 相对链接可解析
node scripts/verify-doc-budgets.mjs    # 预算清单内文档不超限、不缺失
```

推送前跑这两个脚本；`git diff --check` 校验尾随空白。
