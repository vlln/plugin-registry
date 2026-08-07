// acme/loop — 定时循环插件：/loop 命令 + loop 工具，按间隔向当前 agent
// 重复投递 prompt（每轮 = agent.followup 排队一次新 turn，与 goal-session
// 同机制）。对齐 Claude Code 的 /loop 语义：固定间隔 / 自调节（模型每轮
// 可用工具调整或停止）/ 内置维护 prompt。
//
// 边界：会话作用域——循环活在当前 harness 进程，随进程退出消失，不跨重启
// 持久化（与 Claude Code /loop 一致）。client half 经 conversation.input.dock
// 槽显示活动 loop 状态条（与官方 goal / task-status 同一 dock 家族），数据
// 由本文件注册的只读路由提供。
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createUserMessage } from '@deepseek-ai/dsh-llm'

const PLUGIN_ID = 'acme/loop'

/** client half 轮询的活动 loop 列表路由（与 client/index.tsx 的 LOOPS_PATH 一致）。 */
export const LOOPS_PATH = '/plugins/acme/loop/loops'

// 内置维护 prompt（bare `/loop` 用），对齐 Claude Code 文档描述的三件事。
const MAINTENANCE_PROMPT = [
  '这是 loop 维护轮次。按顺序处理：',
  '1. 继续会话中未完成的工作；',
  '2. 照看当前分支的 pull request（评审意见、失败 CI、合并冲突）；',
  '3. 无待办时做一次小的清理（修一个 flaky test、删一条过时注释）。',
  '不要发起范围外的新事项。完成后用 loop 工具停止，或按需要调整间隔。',
].join('\n')

/** 解析 `5m`/`30s`/`1h`/`2d` 或裸数字（分钟）；无法解析返回 null。 */
function parseIntervalMs(raw) {
  const match = /^(\d+)([smhd])?$/.exec(raw.trim())
  if (match === null) return null
  const value = Number(match[1])
  const unit = match[2] ?? 'm'
  const seconds = { s: 1, m: 60, h: 3600, d: 86400 }[unit]
  return value * seconds * 1000
}

/** 人类可读间隔（用于命令回显）。 */
function formatInterval(ms) {
  const minutes = ms / 60000
  if (minutes >= 1440) return `${minutes / 1440}d`
  if (minutes >= 60) return `${minutes / 60}h`
  if (minutes >= 1) return `${minutes}m`
  return `${ms / 1000}s`
}

export default {
  name: 'loop',
  // agents 定位/校验当前 agent；commands 注册 /loop；tools 注册 loop 工具；
  // timer 提供 ctx.interval（生命周期管理的定时器）；httpServer 提供只读
  // 状态路由（client half 轮询）。
  inject: ['agents', 'commands', 'tools', 'timer', 'httpServer'],
  apply(ctx) {
    // agentId -> { agent, prompt, intervalMs, lastDeliveredAt, dispose }
    const loops = new Map()

    // client half 轮询的活动 loop 列表：按 sessionId 过滤（agent.id === sessionId）。
    ctx.effect(() => ctx.httpServer.register({
      kind: 'exact',
      path: LOOPS_PATH,
      handler: async (req, res) => {
        try {
          const url = new URL(req.url ?? '/', 'http://dsh.internal')
          const sessionId = url.searchParams.get('sessionId') ?? ''
          const now = Date.now()
          const rows = []
          for (const [id, state] of loops) {
            if (sessionId !== '' && id !== sessionId) continue
            const nextTick = state.lastDeliveredAt === undefined
              ? now
              : state.lastDeliveredAt + state.intervalMs
            rows.push({
              agentId: id,
              prompt: state.prompt,
              intervalMs: state.intervalMs,
              intervalText: formatInterval(state.intervalMs),
              nextTickAt: nextTick,
            })
          }
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ loops: rows }))
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ error: message }))
        }
      },
    }), 'loop: status route')

    function stopLoop(agent) {
      const state = loops.get(agent.id)
      if (state === undefined) return false
      state.dispose()
      loops.delete(agent.id)
      return true
    }

    function startLoop(agent, prompt, intervalMs) {
      if (loops.has(agent.id)) stopLoop(agent)
      const state = {
        agent,
        prompt,
        intervalMs,
        lastDeliveredAt: undefined,
        dispose: undefined,
      }
      // 每 tick：agent 已销毁则停止；忙则跳过本轮（不堆积 inbox）；
      // 空闲则 followup 投递 prompt。setInterval 语义是首个 tick 要等
      // 一个完整间隔，所以启动时立即补投第一轮（对齐 Claude Code /loop
      // "立即开始 + 周期重复"），之后由 interval 周期投递。
      const deliver = () => {
        if (ctx.agents.get(agent.id) !== agent) {
          stopLoop(agent)
          return
        }
        if (agent.status !== 'idle') return
        state.lastDeliveredAt = Date.now()
        agent.followup(createUserMessage({
          content: [{ type: 'text', text: state.prompt }],
          source: { kind: 'plugin', plugin: PLUGIN_ID },
        }))
      }
      state.dispose = ctx.interval(deliver, intervalMs)
      loops.set(agent.id, state)
      // 命令路径（用户敲 /loop）：agent 此刻空闲，立即投递第一轮；
      // 工具路径（模型 turn 内 loop start）：agent 忙，deliver 会跳过，
      // 本轮结束后由 interval 接管——两种场景都正确。
      deliver()
      return state
    }

    // agent 销毁时清理其循环，防止 Map 泄漏与对已死 agent 的定时投递。
    ctx.on('agent/disposed', (agent) => {
      stopLoop(agent)
    })

    /** 命令：/loop [interval] <prompt> | /loop stop | /loop list */
    ctx.commands.register({
      name: 'loop',
      description: 'Run a prompt on a schedule: /loop [interval] <prompt> | /loop stop | /loop list',
      input: { hint: '[interval] <prompt>' },
      handler: (invocation) => {
        const raw = invocation.rawInput.trim()
        if (raw === '' || raw === 'list') {
          const active = [...loops.values()].filter(s => s.agent === invocation.agent)
          if (active.length === 0) {
            return {
              kind: 'success',
              text: 'No active loop.\n'
                + 'Usage: /loop [interval] <prompt> — e.g. /loop 5m check the deploy\n'
                + 'Bare /loop runs the built-in maintenance prompt.',
            }
          }
          return {
            kind: 'success',
            text: active.map(s => `loop: every ${formatInterval(s.intervalMs)} — ${s.prompt}`).join('\n'),
          }
        }
        if (raw === 'stop' || raw === 'clear') {
          return stopLoop(invocation.agent)
            ? { kind: 'success', text: 'Loop stopped.' }
            : { kind: 'error', text: 'No active loop to stop.' }
        }
        // 前导 token 是间隔则剥掉，否则用默认 1 分钟（模型每轮可用工具调整）。
        const tokens = raw.split(/\s+/)
        const intervalMs = parseIntervalMs(tokens[0])
        const prompt = intervalMs === null ? raw : tokens.slice(1).join(' ')
        startLoop(invocation.agent, prompt, intervalMs ?? 60_000)
        return {
          kind: 'success',
          text: `Loop started: every ${formatInterval(intervalMs ?? 60_000)} — ${prompt}`,
        }
      },
    })

    /** 工具：模型自调节入口（start/stop/status）。 */
    ctx.tools.register(defineTool({
      name: 'loop',
      description: 'Start, stop, or inspect a scheduled loop on the current agent. '
        + 'A loop re-delivers a prompt every interval; use it for polling, PR babysitting, '
        + 'or build-fix-test cycles. The model may adjust the interval or stop the loop '
        + 'each round, which is the self-paced mode.',
      parameters: {
        action: { type: 'string', required: true },
        prompt: { type: 'string' },
        interval: { type: 'string' },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      execute: async (args) => {
        // 工具在 agent turn 内执行：当前发起者即循环的宿主。
        const agent = ctx.agents.currentInitiator()
        if (agent === undefined) throw new Error('loop tool requires an active agent turn')
        switch (args.action) {
          case 'start': {
            if (typeof args.prompt !== 'string' || args.prompt.length === 0) {
              throw new Error('loop start needs a prompt')
            }
            const intervalMs = typeof args.interval === 'string'
              ? (parseIntervalMs(args.interval) ?? 60_000)
              : 60_000
            startLoop(agent, args.prompt, intervalMs)
            return `loop started: every ${formatInterval(intervalMs)} — ${args.prompt}`
          }
          case 'stop':
            return stopLoop(agent) ? 'loop stopped' : 'no active loop'
          case 'status': {
            const state = loops.get(agent.id)
            return state === undefined
              ? 'no active loop'
              : `loop active: every ${formatInterval(state.intervalMs)} — ${state.prompt}`
          }
          default:
            throw new Error(`unknown loop action: ${String(args.action)}`)
        }
      },
    }))
  },
}
