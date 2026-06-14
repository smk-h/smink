/**
 * 类型定义
 */

export type TokenUsage = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export type TurnState =
  | 'idle'           // 空闲
  | 'thinking'       // 思考中
  | 'responding'     // 回复中（流式输出内容）
  | 'done'           // 完成

export type ChatMessage = {
  id: number
  role: 'user' | 'assistant' | 'system'
  content: string
  reasoning?: string        // 思维链 / thinking content
  state: TurnState          // 当前状态
  thinkStartMs?: number     // 思考开始时间
  thinkDurationMs?: number  // 思考持续时间
  totalDurationMs?: number  // 总工作时间
  usage?: TokenUsage
}

// ─── 斜杠命令类型（仿 Claude Code Command 联合类型）──────

export type SlashCommand = {
  name: string                // 命令名（不含 /）
  aliases?: string[]          // 别名列表
  description: string        // 命令描述
  argumentHint?: string      // 参数占位提示
  prompt: string              // 发送给 LLM 的提示词
}

export type CommandSuggestion = {
  command: SlashCommand
  matchedAlias?: string       // 匹配到的别名
}

// ─── Markdown 渲染器类型 ───

export type MdSegment = { text: string; bold?: boolean; italic?: boolean; code?: boolean }
