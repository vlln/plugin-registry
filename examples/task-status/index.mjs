// vlln/task-status Node half：自造数据通道——注册一个只读 JSON 路由，
// 轮询时返回宿主 `ctx.tasks` 的当前任务快照。不依赖官方推送帧（useTasks /
// task/snapshot）：客户端每 1s fetch 本路由刷新，官方树零改动。
//
// 任务可见性：`tasks.list(caller)` 的 owner fence 让无 agent 身份的调用方
// 只看到 unowned 任务，所以这里遍历 `ctx.agents.list()` 逐个取 owned 任务
// 再并上 unowned（按 id 去重）——这是示例演示的"自造缝"替代 `listOwned`。

/** 只读任务列表路由（与 client bundle 轮询地址一致）。 */
export const TASKS_PATH = '/plugins/vlln/task-status/tasks'

/** 任务输出读取路由（tail：每次返回保留输出全文，非消耗式）。 */
export const OUTPUT_PATH = '/plugins/vlln/task-status/output'

/** Cordis 插件名。 */
export const name = 'task-status'

/** 所需服务：web 形状的 HTTP 载体 + 任务注册表 + agent 注册表。 */
export const inject = ['httpServer', 'tasks', 'agents']

/** 裁剪任务快照到 wire 视图（内部记账不跨线；owner 只投影 session id）。 */
function toWire(snapshot) {
  return {
    id: snapshot.id,
    kind: snapshot.kind,
    label: snapshot.label,
    status: snapshot.status,
    ...(snapshot.detail !== undefined ? { detail: snapshot.detail } : {}),
    startedAt: snapshot.startedAt,
    ...(snapshot.finishedAt !== undefined ? { finishedAt: snapshot.finishedAt } : {}),
    ...(snapshot.ownerSession !== undefined ? { ownerSession: snapshot.ownerSession } : {}),
  }
}

/** 收集宿主全部任务：owned（按 agent 遍历，绕过 owner fence）+ unowned，按 id 去重。 */
function collectTasks(ctx) {
  const tasks = ctx.tasks
  const seen = new Set()
  const out = []
  for (const agent of ctx.agents.list()) {
    for (const snapshot of tasks.list(agent)) {
      if (snapshot.ownerSession === undefined || seen.has(snapshot.id)) continue
      seen.add(snapshot.id)
      out.push(toWire(snapshot))
    }
  }
  for (const snapshot of tasks.list()) {
    if (seen.has(snapshot.id)) continue
    seen.add(snapshot.id)
    out.push(toWire(snapshot))
  }
  return out
}

/**
 * 读取一个任务的输出 tail（非消耗式）。`tasks.peek(id, caller)` 的 owner
 * fence 与 `read` 一致——先按 agent 遍历找到任务的 owner（其 `list(agent)`
 * 含该 id），用该 agent 身份 peek；unowned 直接 peek。
 *
 * 与 `tasks.read` 的区别：peek 不推进 per-task 游标，也不标记 reported——
 * 自动轮询 tail 不再与官方 `task_output` 工具的读取竞争（官方工具读到的
 * 增量不受影响），终态通知仍由首次消耗式 read/wait 交付。
 * @param ctx - host cordis context。
 * @param id - 任务 id。
 * @returns 当前保留输出 text 与快照；任务不存在返回 null。
 */
function readTaskOutput(ctx, id) {
  const tasks = ctx.tasks
  for (const agent of ctx.agents.list()) {
    if (tasks.list(agent).some(snapshot => snapshot.id === id)) {
      return { text: tasks.peek(id, agent).text, snapshot: toWire(tasks.list(agent).find(s => s.id === id)) }
    }
  }
  return { text: tasks.peek(id).text, snapshot: toWire(tasks.list().find(s => s.id === id)) }
}

/**
 * 插件主体：注册任务列表与输出读取路由。路由只读、无副作用；handler 异常
 * 以 500 返回，客户端轮询吞掉瞬态错误。
 * @param ctx - host cordis context。
 */
export function apply(ctx) {
  ctx.effect(() => {
    const disposeTasks = ctx.httpServer.register({
      kind: 'exact',
      path: TASKS_PATH,
      handler: async (_req, res) => {
        try {
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ tasks: collectTasks(ctx) }))
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ error: message }))
        }
      },
    })
    const disposeOutput = ctx.httpServer.register({
      kind: 'exact',
      path: OUTPUT_PATH,
      handler: async (req, res) => {
        try {
          const url = new URL(req.url ?? '/', 'http://dsh.internal')
          const id = url.searchParams.get('id') ?? ''
          if (id === '') {
            res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify({ error: 'missing task id' }))
            return
          }
          const read = readTaskOutput(ctx, id)
          if (read === null || read.snapshot === undefined) {
            res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify({ error: `task ${id} not found` }))
            return
          }
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ text: read.text, snapshot: read.snapshot }))
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ error: message }))
        }
      },
    })
    return () => {
      disposeTasks()
      disposeOutput()
    }
  }, 'task-status: tasks + output routes')
}
