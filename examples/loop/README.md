# acme/loop

定时循环插件：`/loop` 命令 + `loop` 工具，按间隔向当前 agent 重复投递 prompt，对齐 Claude Code `/loop` 语义（[调研笔记](../../README.md#agent-skill)）。

## 安装与启用

```sh
dsh registry install ./examples/loop
dsh registry enable acme/loop
```

## 命令用法

```sh
/loop 5m check the deploy        # 固定间隔：每 5 分钟投递一次 prompt
/loop check the deploy           # 省略间隔：默认 1 分钟（模型每轮可用工具自调节）
/loop                            # 内置维护 prompt（继续未完成工作 → 照看 PR → 清理）
/loop stop                       # 停止当前循环
/loop list                       # 查看活动循环
```

间隔支持 `s` / `m` / `h` / `d` 单位（`30s`、`5m`、`2h`、`1d`），裸数字按分钟（`5` = 5 分钟）。

## 工具用法（模型自调节）

模型在 turn 内调用 `loop` 工具：

```json
{ "action": "start", "prompt": "check CI and address review comments", "interval": "5m" }
{ "action": "status" }
{ "action": "stop" }
```

每轮结束后模型可再次调用工具调整间隔或停止——这就是自调节模式（等效 Claude Code 省略间隔的 `/loop`）。

## 工作原理

- 每轮 = `agent.followup(createUserMessage({ content, source: { kind: 'plugin', plugin: 'acme/loop' } }))`——与官方 goal-session 驱动多轮同一机制
- 定时 = `ctx.interval()`（vendored timer，生命周期管理的定时器，返回 disposer）
- 调度纪律：agent 忙则跳过本轮（不堆积 inbox）；agent 销毁则自动停止循环
- 命令定位会话 = `CommandInvocation.agent`；工具定位会话 = `ctx.agents.currentInitiator()`

## 与官方 /goal 的关系

官方树已有 `/goal`（goal 域：create/edit/pause/resume/blocked + 独立评判）——它管"跑到条件满足"。本插件补上 **`/loop` 语义**（定时/自调节重复），两者互补不重造。loop 的每轮是**同一 prompt 的重复投递**，goal 的每轮是**向条件收敛的推进**。

## 边界

- **会话作用域**：循环活在当前 harness 进程，随进程退出消失，不跨重启持久化（与 Claude Code `/loop` 一致）
- **Node 侧行为**：registry 插件不在 Loader 树、无 client bundle，本插件不涉及浏览器
- **间隔是下限**：忙碌 agent 跳过 tick，实际轮次间隔 ≥ 配置间隔
