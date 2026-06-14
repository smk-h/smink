/**
 * Claude Code 风格符号表
 * 统一管理所有特殊字符，参考 Claude Code 源码 figures 体系
 */

export const F = {
  /** ❯ U+276F - 输入提示符，对应 figures.pointer，Claude Code PromptInputModeIndicator 使用 */
  pointer: '\u276F',

  /** ● U+25CF - 回复正文前的实心圆点项目符号 */
  bullet: '\u25CF',

  /** ✻ U+273B - 思考/完成状态的旋转器图标，Claude Code Spinner 使用 */
  spinner: '\u273B',

  /** ∴ U+2234 - 展开思考内容前的"所以"符号，Claude 源码 ThinkingMessage 使用 */
  therefore: '\u2234',

  /** ▎U+258E - 流式输出时的光标竖线 */
  cursor: '\u258E',

  /** · U+00B7 - 中点分隔符，用于 "1s · thinking" 等场景 */
  middot: '\u00B7',
}
