// acme/loop — 定时循环插件：/loop 命令 + loop 工具，按间隔向当前 agent
// 重复投递 prompt（每轮 = agent.followup 排队一次新 turn，与 goal-session
// 同机制）。对齐 Claude Code 的 /loop 语义：固定间隔 / 自调节（模型每轮
// 可用工具调整或停止）/ 内置维护 prompt。
//
// 边界：会话作用域——循环活在当前 harness 进程，随进程退出消失，不跨重启
// 持久化（与 Claude Code /loop 一致）。registry 插件不在 Loader 树，无
// client bundle，本插件纯 Node 侧行为。
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createUserMessage } from '@deepseek-ai/dsh-llm'

const PLUGIN_ID = 'acme/loop'

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
  // timer 提供 ctx.interval（生命周期管理的定时器）。
  inject: ['agents', 'commands', 'tools', 'timer'],
  apply(ctx) {
    // agentId -> { agent, prompt, intervalMs, dispose }
    const loops = new Map()

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
        dispose: undefined,
      }
      // 每 tick：agent 已销毁则停止；忙则跳过本轮（不堆积 inbox）；
      // 空闲则 followup 投递下一轮 prompt。
      state.dispose = ctx.interval(() => {
        if (ctx.agents.get(agent.id) !== agent) {
          stopLoop(agent)
          return
        }
        if (agent.status !== 'idle') return
        agent.followup(createUserMessage({
          content: [{ type: 'text', text: state.prompt }],
          source: { kind: 'plugin', plugin: PLUGIN_ID },
        }))
      }, intervalMs)
      loops.set(agent.id, state)
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
