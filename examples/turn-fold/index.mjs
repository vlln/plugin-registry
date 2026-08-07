// vlln/turn-fold Node half：纯 UI 插件，无 Node 逻辑。占位入口——
// client half 通过 manifest 的 client.main 加载；本文件存在使插件在
// registry 中作为「有 Node half 的插件」登记（main 指向），实际不
// 注册任何服务/工具（contributes.tools 为空，注册面零声明）。
export const name = 'turn-fold'

export function apply() {
  // 无 Node 侧行为：所有能力都在浏览器端（conversation.chat.turnTail 槽）。
}
