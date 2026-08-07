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
- 定时 = `ctx.interval()`（vendored timer，生命周期管理的定时器，返回 disposer）；`setInterval` 首个 tick 要等一个完整间隔，故启动时**立即投递第一轮**（对齐 Claude Code `/loop`「立即开始 + 周期重复」），之后按间隔周期投递
- 调度纪律：agent 忙则跳过本轮（不堆积 inbox）；agent 销毁则自动停止循环
- 命令定位会话 = `CommandInvocation.agent`；工具定位会话 = `ctx.agents.currentInitiator()`
- **状态条（client half）**：注入官方 `conversation.input.dock` 槽（与 goal / task-status 同一 dock 家族），Node half 注册只读路由 `/plugins/acme/loop/loops?sessionId=` 暴露活动循环（间隔 + prompt + 下次 tick），client 每 1s 轮询并只渲染当前会话——有循环则显示「🔁 loop: 每 5m — prompt · 下次 23s」，无则隐藏。轮询避免推帧依赖，零官方改动。

## 构建 client bundle

`client.js` 是 `client/index.tsx` 的手写等价物（`window.__ModuleLoader__.load({ id, factory })` 格式，同 examples/navbar / task-status 模式）；改 TSX 后需同步手写 JS 产物（生产用 bundler 生成）。

## 与官方 /goal 的关系

官方树已有 `/goal`（goal 域：create/edit/pause/resume/blocked + 独立评判）——它管"跑到条件满足"。本插件补上 **`/loop` 语义**（定时/自调节重复），两者互补不重造。loop 的每轮是**同一 prompt 的重复投递**，goal 的每轮是**向条件收敛的推进**。

## 边界

- **会话作用域**：循环活在当前 harness 进程，随进程退出消失，不跨重启持久化（与 Claude Code `/loop` 一致）
- **状态条仅进程内可见**：client half 轮询 Node half 内存状态，重启后状态条与循环一起消失（不跨重启持久化）
- **间隔是下限**：忙碌 agent 跳过 tick，实际轮次间隔 ≥ 配置间隔
