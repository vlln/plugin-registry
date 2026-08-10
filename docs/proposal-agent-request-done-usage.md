# 机制提案：宿主暴露模型 token 用量（usage）事件

> **历史文档（2026-08 转向后）**：本文描述 plugin-registry 已移除的独立机制（patch/CLI/`ctx.plugins`），仅作决策依据与演进记录保留；当前形态见 [official-0809-coverage](official-0809-coverage.md) 与 `packages/plugin/console`。


> 状态：proposed（机制开发需求记录，供 test-vlln 机制分支评估实现）
> 提出方：dsh-pet 插件（registry 生态消费者）

## 需求

dsh-pet 的成长系统目前以「任务完成 / 会话 / 陪伴时长」为 XP 来源（见 dsh-pet `src/pet-state.mjs`）。产品方向考虑把「模型 token 消耗」纳入成长度量（工作投入 → 宠物成长），但**宿主当前不向插件暴露 token 用量**，无法实现。

## 现状（宿主事件面核查，0808 基线）

| 事件/接口 | payload | 是否含 usage |
|---|---|---|
| `agent/request`（core/agent） | `{ agent, turn, step, signal }` | ❌ |
| `agent/request-error` | `{ agent, turn, step, provider, failure }` | ❌ |
| `agent/pre-step` / `agent/status` / `agent/turn-stopping` | 状态类 | ❌ |
| `tasks.onTaskDone`（TaskSnapshot） | `{ id, kind, status, detail, output }` | ❌（detail 是 kind 字符串） |
| `agent/session-start` | `{ agent, source }` | ❌ |

宿主 LLM 调用的 usage（prompt/completion token）是内部事实（provider adapter 层），未对外广播。registry 插件（dsh-pet）是纯消费者，无法从现有事件面推导 token 数。

## 建议的 API 形状（供机制侧评估）

**方案 A（推荐）：`agent/request-done` 事件**——在模型请求成功返回后 emit，携带 usage：

```ts
'agent/request-done'(this: Scoped<Agent>, payload: {
  agent: Agent
  turn: number
  step: number
  provider: string
  usage: { promptTokens: number; completionTokens: number; totalTokens: number }
}): void
```

- 与现有 `agent/request`（发起）对称，`request-done`（完成）是自然补充
- usage 是 provider adapter 归一化后的标准形状（各 provider 已映射）
- scope-filtered 分发与现有 agent 事件一致（`@deepseek-ai/dsh-scope`）

**方案 B：`agent/request` 的返回值带 usage**——把 waterfall 的 `LlmCallConfig` 返回扩展。改动面更大（waterfall 语义变化），不推荐。

**方案 C：TaskSnapshot 扩展 usage 字段**——任务级聚合（多步请求求和）。对「任务完成的 token 总量」语义友好，但与单次请求粒度不符（一任务可能多次请求）。

## 消费侧（若实现，dsh-pet 将）

- 订阅 `agent/request-done`，按 agent 域聚合 token 消耗
- 成长系统加「工作投入」维度：**token XP 为次级来源**（每 N token = 1 XP，远低于任务 +10，防 XP 通胀），或作为独立「工作投入」统计显示
- 决策记录 + 门禁守护（XP 数值封闭在语义层）

## 验收标准（机制侧）

1. 新事件在 provider adapter 完成后触发，payload 含真实 usage
2. 无 usage 数据时（流式未聚合/失败）事件不误发或 usage 置 0
3. 与现有 `agent/request` / `agent/request-error` 时序无冲突（done 只发一次）
4. registry 插件可 `ctx.on('agent/request-done')` 订阅（scope 过滤生效）

## 关联

- dsh-pet 成长系统设计：见 dsh-pet 仓库 docs（成长系统盘点）
- 机制实现走 test-vlln 机制分支 → 同步 plugin-registry patch 重建
