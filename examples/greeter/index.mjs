// 一个 Cordis 插件：导出带 apply(ctx) 的对象（也可以是函数或类）。
// 入口与 dsh.plugin.json 的 contributes.tools 必须同步：这里注册的
// 工具名 greet 与清单声明一致，否则启用时会挂载失败并报出缺失工具。
import { defineTool } from '@deepseek-ai/dsh-tools'

export default {
  name: 'greeter',
  // 声明依赖官方树的 tools 服务，Cordis 会等待它就绪后再 apply。
  inject: ['tools'],
  apply(ctx) {
    ctx.tools.register(defineTool({
      name: 'greet',
      description: 'Greet someone.',
      parameters: { name: { type: 'string', required: true } },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      execute: async (args) => `hello, ${args.name}`,
    }))
  },
}
