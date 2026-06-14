/**
 * 全局常量
 */

/** 模型名 */
export const MODEL_NAME = 'deepseek-v4-pro'

/** Claude Code 风格的完成动词 */
export const TURN_VERBS = [
  'Worked', 'Baked', 'Brewed', 'Churned', 'Cogitated',
  'Cooked', 'Crunched', 'Sautéed',
]

/** Claude Code 思考阶段的动态动词 */
export const THINKING_VERBS = [
  'Propagating', 'Ruminating', 'Pondering', 'Cogitating',
  'Meditating', 'Mulling', 'Reflecting', 'Simulating',
]

/** 命令建议列表最多可见项数 */
export const MAX_VISIBLE_SUGGESTIONS = 5

/** 命令名列固定宽度，保证描述左对齐 */
export const COMMAND_COL_WIDTH = 28
