/** defineTool stub：测试只调 execute/断言结构，构造行为无关。 */
export function defineTool<T extends Record<string, unknown>>(options: T): T {
  return options
}
export type ToolDefinition = { name?: string; execute?: (args: never, exec: unknown) => unknown } & Record<string, unknown>
export type ToolExecution = unknown
export type ToolResult = unknown
