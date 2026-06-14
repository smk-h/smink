/**
 * Claude Code Style Terminal UI - 仿 Claude Code 终端界面
 *
 * 功能：
 *   - 仿 Claude Code 的暗色终端风格
 *   - `>` 提示符输入
 *   - 用户消息显示为 `> 文本`
 *   - 思考内容折叠显示：Thought for Xs (ctrl+o to expand)，浅灰色
 *   - Ctrl+O 展开思考内容（带边框、完整思维链、时间戳、模型名）
 *   - AI 回复带 ⎿ 缩进 + ● 项目符号
 *   - ✻ Worked for Xs 完成状态
 *   - 底部快捷键提示栏
 *   - 流式输出支持 reasoning_content
 *
 * 快捷键：
 *   Enter    - 发送消息
 *   Ctrl+C   - 退出
 *   Ctrl+L   - 清空对话
 *   Ctrl+O   - 展开/折叠最新消息的思考内容
 */

import React, { useState, useRef, useCallback, useEffect } from 'react'
import {
  render,
  Box,
  Text,
  Newline,
  ScrollBox,
  useInput,
  useApp,
  colorize,
} from '../src/index.js'
import { stringWidth } from '../src/ink/stringWidth.js'
import OpenAI from 'openai'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// ─── 环境变量 ────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env') })

// ─── OpenAI 客户端 ────────────────────────────────

const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: `${process.env.DEEPSEEK_API_KEY}`,
})

// ─── 类型定义 ─────────────────────────────────────

type TokenUsage = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

type TurnState =
  | 'idle'           // 空闲
  | 'thinking'       // 思考中
  | 'responding'     // 回复中（流式输出内容）
  | 'done'           // 完成

type ChatMessage = {
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

type SlashCommand = {
  name: string                // 命令名（不含 /）
  aliases?: string[]          // 别名列表
  description: string        // 命令描述
  argumentHint?: string      // 参数占位提示
  prompt: string              // 发送给 LLM 的提示词
}

type CommandSuggestion = {
  command: SlashCommand
  matchedAlias?: string       // 匹配到的别名
}

// ─── Claude Code 风格符号表 ─────────────────────────
// 统一管理所有特殊字符，参考 Claude Code 源码 figures 体系

const F = {
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

// ─── Clawd 吉祥物（仿 Claude Code 源码 Clawd.tsx）─────────
// 默认姿态 9 列宽，3 行高
//  ▐▛███▜▌
//  ▝▜█████▛▘
//    ▘▘ ▝▝

const Clawd = () => (
  <Box flexDirection="column">
    <Text>
      <Text color={C.claude}>{' ▐'}</Text>
      <Text color={C.claude} backgroundColor={C.clawdBg}>{'▛███▜'}</Text>
      <Text color={C.claude}>{'▌'}</Text>
    </Text>
    <Text>
      <Text color={C.claude}>{'▝▜'}</Text>
      <Text color={C.claude} backgroundColor={C.clawdBg}>{'█████'}</Text>
      <Text color={C.claude}>{'▛▘'}</Text>
    </Text>
    <Text color={C.claude}>{'  ▘▘ ▝▝  '}</Text>
  </Box>
)

// ─── 左列宽度计算（仿 Claude Code logoV2Utils.ts）───────────

const MAX_LEFT_WIDTH = 50
const CLAWD_ART_MIN_WIDTH = 20 // 与 Claude Code logoV2Utils.ts 一致

/** 根据左列内容动态计算最优宽度 */
function calculateOptimalLeftWidth(
  greeting: string,
  cwd: string,
  modelLine: string,
): number {
  const contentWidth = Math.max(
    stringWidth(greeting),
    stringWidth(cwd),
    stringWidth(modelLine),
    CLAWD_ART_MIN_WIDTH,
  )
  return Math.min(contentWidth + 4, MAX_LEFT_WIDTH) // +4 for padding
}

// ─── 欢迎栏组件（仿 Claude Code LogoV2 布局）──────────────

interface WelcomeBannerProps {
  /** 应用名 + 版本标题，如 "Claude Code v2.1.175" */
  title?: string
  /** 欢迎语，如 "Welcome back!" */
  greeting?: string
  /** 模型名 */
  model?: string
  /** 当前工作目录 */
  cwd?: string
  /**
   * - true  → 订阅用户，显示套餐名（如 "Claude Pro"）
   * - false → API Key 用户，显示 "API Usage Billing"
   */
  isSubscriber?: boolean
  /** 订阅套餐名，仅 isSubscriber=true 时生效 */
  subscriptionName?: string
  /** 右列 Feed 条目列表 */
  feeds?: Array<{ heading: string; items: string[] }>
}

const WelcomeBanner = ({
  title = 'Claude Code',
  greeting = 'Welcome back!',
  model = MODEL_NAME,
  cwd = process.cwd(),
  isSubscriber = false,
  subscriptionName = 'Claude Pro',
  feeds,
}: WelcomeBannerProps) => {
  const defaultFeeds: NonNullable<WelcomeBannerProps['feeds']> = [
    { heading: 'Recent activity', items: ['No recent sessions'] },
    { heading: "What's new", items: ['Check /release-notes for updates'] },
  ]
  const feedList = feeds ?? defaultFeeds

  // 计费类型：与 Claude Code logoV2Utils.getLogoDisplayData 一致
  // isClaudeAISubscriber() ? getSubscriptionName() : 'API Usage Billing'
  const billingType = isSubscriber ? subscriptionName : 'API Usage Billing'

  // 动态计算左列宽度（仿 Claude Code logoV2Utils.calculateOptimalLeftWidth）
  const modelLine = `${model} ${F.middot} ${billingType}`
  const leftWidth = calculateOptimalLeftWidth(greeting, cwd, modelLine)

  // 边框标题：与 Claude Code LogoV2 源码 formatBorderTitle 一致
  // color("claude", userTheme)("Claude Code") → foreground only, 无背景色
  const borderTitle = ` ${colorize(title, C.claude, 'foreground')} ${colorize('v2.1.175', C.inactive, 'foreground')} `

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={C.claude}
      borderText={{
        content: borderTitle,
        position: 'top',
        align: 'start',
        offset: 3,
      }}
      paddingX={1}
    >
      <Box flexDirection="row">
        {/* 左列：欢迎语 + Clawd 吉祥物 + 模型信息 — 宽度由内容动态决定 */}
        <Box flexDirection="column" width={leftWidth} alignItems="center" paddingY={1}>
          <Box marginBottom={1}>
            <Text color={C.inactive}>{greeting}</Text>
          </Box>
          <Clawd />
          <Box flexDirection="column" alignItems="center" marginTop={1}>
            <Text color={C.inactive} dim>{model} {F.middot} {billingType}</Text>
            <Text color={C.inactive} dim>{cwd}</Text>
          </Box>
        </Box>

        {/* 竖线分隔：与 Claude Code 源码 borderColor="claude" borderDimColor 一致 */}
        <Box
          borderStyle="single"
          borderColor={C.claude}
          borderDimColor
          borderLeft
          borderRight={false}
          borderTop={false}
          borderBottom={false}
        />

        {/* 右列：Feed 信息 */}
        <Box flexDirection="column" flexGrow={1} paddingLeft={1}>
          {feedList.map((feed, i) => (
            <Box
              key={feed.heading}
              flexDirection="column"
              marginBottom={i < feedList.length - 1 ? 1 : 0}
              marginTop={i > 0 ? 1 : 0}
            >
              <Text color={C.claude} bold>{feed.heading}</Text>
              {feed.items.map(item => (
                <Text key={item} dim>{F.middot} {item}</Text>
              ))}
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  )
}

// ─── Claude Code 风格色彩方案 ─────────────────────
// 完全对齐 Claude Code darkTheme (theme.ts → darkTheme L440-515)
// 所有颜色值均从源码逐字段提取，注释标注对应的 darkTheme 字段名

const _T = {
  // ── 基础文字色 ──
  text:                  'rgb(255,255,255)',  // darkTheme.text — 主文字色（白）
  subtle:                'rgb(80,80,80)',     // darkTheme.subtle — 暗灰辅助文字
  inactive:              'rgb(153,153,153)',  // darkTheme.inactive — 非活跃/灰色文字

  // ── Claude 品牌色 ──
  claude:                'rgb(215,119,87)',   // darkTheme.claude — Claude 品牌橙
  claudeShimmer:         'rgb(235,159,127)',  // darkTheme.claudeShimmer — 橙色高亮

  // ── 吉祥物 Clawd ──
  clawdBody:             'rgb(215,119,87)',   // darkTheme.clawd_body — 与 claude 相同
  clawdBg:               'rgb(0,0,0)',        // darkTheme.clawd_background — 纯黑

  // ── 提示符 / 边框 ──
  promptBorder:          'rgb(136,136,136)',  // darkTheme.promptBorder — 中灰边框
  promptBorderShimmer:   'rgb(166,166,166)',  // darkTheme.promptBorderShimmer — 亮灰

  // ── 语义色 ──
  error:                 'rgb(255,107,128)',  // darkTheme.error — 亮红
  success:               'rgb(78,186,101)',   // darkTheme.success — 亮绿
  warning:               'rgb(255,193,7)',    // darkTheme.warning — 琥珀
  permission:            'rgb(177,185,249)',  // darkTheme.permission — 浅蓝紫
  suggestion:            'rgb(177,185,249)',  // darkTheme.suggestion — 浅蓝紫
  background:            'rgb(0,204,204)',    // darkTheme.background — 青色

  // ── Diff 色彩 ──
  diffAdded:             'rgb(34,92,43)',     // darkTheme.diffAdded — 深绿
  diffRemoved:           'rgb(122,41,54)',    // darkTheme.diffRemoved — 深红

  // ── Bash / 工具边框 ──
  bashBorder:            'rgb(253,93,177)',   // darkTheme.bashBorder — 亮粉

  // ── 计划模式 / IDE ──
  planMode:              'rgb(72,150,140)',   // darkTheme.planMode — 灰绿
  ide:                   'rgb(71,130,200)',   // darkTheme.ide — 暗蓝

  // ── 选中 / 快捷模式 ──
  autoAccept:            'rgb(175,135,255)',  // darkTheme.autoAccept — 电紫
  fastMode:              'rgb(255,120,20)',   // darkTheme.fastMode — 亮橙
  chromeYellow:          'rgb(251,188,4)',    // darkTheme.chromeYellow — Chrome 黄

  // ── TUI V2 背景 ──
  userMsgBg:             'rgb(55,55,55)',     // darkTheme.userMessageBackground
  userMsgBgHover:        'rgb(70,70,70)',     // darkTheme.userMessageBackgroundHover
  selectionBg:           'rgb(38,79,120)',    // darkTheme.selectionBg
  bashMsgBg:             'rgb(65,60,65)',     // darkTheme.bashMessageBackgroundColor
} as const

// 带别名的完整色彩对象 — 别名直接引用同一值，保证单一数据源
const C: Record<string, string> = {
  ..._T,
  // ── 语义别名（组件内可读性）──
  userText:         _T.text,          // 用户消息文字色
  thoughtDim:       _T.subtle,        // 思考状态暗灰
  responseText:     _T.text,          // AI 回复正文
  promptChar:       _T.text,          // 提示符 ❯
  indentBracket:    _T.inactive,      // 缩进符号 ⎿
  bullet:           _T.text,          // 项目符号 ●
  workedDim:        _T.inactive,      // 完成状态 ✻
  hintDim:          _T.promptBorder,  // 底部提示栏 / 边框
  feedHeading:      _T.claude,        // Feed 标题用品牌橙
  feedItem:         _T.subtle,        // Feed 内容暗灰
}

// ─── 工具函数 ─────────────────────────────────────

/** 格式化时长（秒），至少返回 1s */
function formatDuration(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000))
  return `${seconds}s`
}

/** 格式化时间为 "09:02 AM" 风格 */
function formatTime(date: Date = new Date()): string {
  let hours = date.getHours()
  const minutes = date.getMinutes().toString().padStart(2, '0')
  const ampm = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12 || 12
  return `${hours.toString().padStart(2, '0')}:${minutes} ${ampm}`
}

const MODEL_NAME = 'deepseek-v4-pro'

// ─── 斜杠命令注册表（仿 Claude Code COMMANDS 注册表）─────

const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: 'hello',
    description: 'Say hello to the assistant',
    prompt: '你好',
  },
  {
    name: 'sky',
    description: 'Ask why the sky is blue',
    prompt: '天空为什么是蓝色的',
  },
  {
    name: 'skills',
    aliases: ['s'],
    description: 'Ask what the assistant can do',
    prompt: '你可以做什么',
  },
]

// ─── 斜杠命令匹配引擎（仿 Claude Code commandSuggestions）───

/** 检测输入是否为斜杠命令 */
function isCommandInput(input: string): boolean {
  return input.startsWith('/')
}

/** 从输入中提取命令查询词（去除 / 和参数） */
function getCommandQuery(input: string): string {
  const spaceIndex = input.indexOf(' ')
  if (spaceIndex === -1) return input.slice(1).toLowerCase()
  return input.slice(1, spaceIndex).toLowerCase()
}

/** 检测输入中是否已有参数 */
function hasCommandArgs(input: string): boolean {
  if (!isCommandInput(input)) return false
  const spaceIndex = input.indexOf(' ')
  if (spaceIndex === -1) return false
  // 只有空格没有实际内容不算有参数
  return input.slice(spaceIndex + 1).trim().length > 0
}

/** 精确匹配 + 别名匹配 + 前缀模糊匹配，返回排序后的建议列表 */
function generateCommandSuggestions(input: string): CommandSuggestion[] {
  if (!isCommandInput(input)) return []
  // 有实际参数时不展示建议
  if (hasCommandArgs(input)) return []

  const query = input.slice(1).toLowerCase().trim()

  // 仅输入 / 时展示全部命令
  if (query === '') {
    return SLASH_COMMANDS.map(cmd => ({ command: cmd }))
  }

  const results: CommandSuggestion[] = []
  const seen = new Set<string>()

  // 优先级 1：精确名称匹配
  for (const cmd of SLASH_COMMANDS) {
    if (cmd.name.toLowerCase() === query && !seen.has(cmd.name)) {
      seen.add(cmd.name)
      results.push({ command: cmd })
    }
  }

  // 优先级 2：精确别名匹配
  for (const cmd of SLASH_COMMANDS) {
    if (seen.has(cmd.name)) continue
    const matchedAlias = cmd.aliases?.find(a => a.toLowerCase() === query)
    if (matchedAlias) {
      seen.add(cmd.name)
      results.push({ command: cmd, matchedAlias })
    }
  }

  // 优先级 3：名称前缀匹配
  for (const cmd of SLASH_COMMANDS) {
    if (seen.has(cmd.name)) continue
    if (cmd.name.toLowerCase().startsWith(query)) {
      seen.add(cmd.name)
      results.push({ command: cmd })
    }
  }

  // 优先级 4：别名前缀匹配
  for (const cmd of SLASH_COMMANDS) {
    if (seen.has(cmd.name)) continue
    const matchedAlias = cmd.aliases?.find(a => a.toLowerCase().startsWith(query))
    if (matchedAlias) {
      seen.add(cmd.name)
      results.push({ command: cmd, matchedAlias })
    }
  }

  // 优先级 5：名称包含匹配（简单模糊）
  for (const cmd of SLASH_COMMANDS) {
    if (seen.has(cmd.name)) continue
    if (cmd.name.toLowerCase().includes(query)) {
      seen.add(cmd.name)
      results.push({ command: cmd })
    }
  }

  // 优先级 6：描述包含匹配
  for (const cmd of SLASH_COMMANDS) {
    if (seen.has(cmd.name)) continue
    if (cmd.description.toLowerCase().includes(query)) {
      seen.add(cmd.name)
      results.push({ command: cmd })
    }
  }

  return results
}

/** 获取最佳匹配用于 Ghost Text 内联补全 */
function getBestCommandMatch(
  partialCommand: string,
): { suffix: string; fullCommand: string } | null {
  if (!partialCommand) return null
  const query = partialCommand.toLowerCase()

  // 先查名称前缀
  for (const cmd of SLASH_COMMANDS) {
    if (cmd.name.toLowerCase().startsWith(query)) {
      const suffix = cmd.name.slice(partialCommand.length)
      if (suffix) return { suffix, fullCommand: cmd.name }
    }
  }

  // 再查别名前缀（Ghost Text 不展示别名，补全为真实名称）
  for (const cmd of SLASH_COMMANDS) {
    const matchedAlias = cmd.aliases?.find(a => a.toLowerCase().startsWith(query))
    if (matchedAlias) {
      // 补全为真实命令名而非别名
      const suffix = cmd.name.slice(partialCommand.length)
      if (suffix) return { suffix, fullCommand: cmd.name }
      return null
    }
  }

  return null
}

/** 解析斜杠命令，返回命令对象和参数 */
function parseSlashCommand(inputStr: string): { command: SlashCommand; args: string } | null {
  const trimmed = inputStr.trim()
  if (!trimmed.startsWith('/')) return null

  const withoutSlash = trimmed.slice(1)
  const spaceIndex = withoutSlash.indexOf(' ')
  const commandName = spaceIndex === -1 ? withoutSlash : withoutSlash.slice(0, spaceIndex)
  const args = spaceIndex === -1 ? '' : withoutSlash.slice(spaceIndex + 1)
  const query = commandName.toLowerCase()

  // 精确名称匹配
  const exactMatch = SLASH_COMMANDS.find(cmd => cmd.name.toLowerCase() === query)
  if (exactMatch) return { command: exactMatch, args }

  // 别名匹配
  const aliasMatch = SLASH_COMMANDS.find(cmd =>
    cmd.aliases?.some(a => a.toLowerCase() === query),
  )
  if (aliasMatch) return { command: aliasMatch, args }

  return null
}

/** Claude Code 风格的完成动词 */
const TURN_VERBS = [
  'Worked', 'Baked', 'Brewed', 'Churned', 'Cogitated',
  'Cooked', 'Crunched', 'Sautéed',
]
function pickVerb(): string {
  return TURN_VERBS[Math.floor(Math.random() * TURN_VERBS.length)]
}

// ─── API 调用（流式） ─────────────────────────────

async function streamChat(
  messages: Array<{ role: string; content: string }>,
  onThinking: () => void,
  onChunk: (content: string, reasoning: string) => void,
  onDone: (content: string, reasoning: string, usage?: TokenUsage) => void,
  onError: (err: Error) => void,
) {
  try {
    const stream = await openai.chat.completions.create({
      messages: messages as any,
      model: 'deepseek-v4-flash',
      thinking: { type: 'enabled' },
      stream: true,
      stream_options: { include_usage: true },
    })

    let fullContent = ''
    let fullReasoning = ''
    let hasReasoning = false
    let usage: TokenUsage | undefined
    let thinkingNotified = false

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta
      if (delta) {
        if (delta.reasoning_content) {
          if (!hasReasoning) {
            hasReasoning = true
            if (!thinkingNotified) {
              thinkingNotified = true
              onThinking()
            }
          }
          fullReasoning += delta.reasoning_content
        }
        if (delta.content) {
          fullContent += delta.content
        }
      }
      if (chunk.usage) {
        usage = {
          promptTokens: chunk.usage.prompt_tokens ?? 0,
          completionTokens: chunk.usage.completion_tokens ?? 0,
          totalTokens: chunk.usage.total_tokens ?? 0,
        }
      }
      onChunk(fullContent, fullReasoning)
    }

    onDone(fullContent, fullReasoning, usage)
  } catch (err: any) {
    onError(err instanceof Error ? err : new Error(String(err.message || err)))
  }
}

// ─── 组件：用户消息行 ──────────────────────────────

const UserMessageLine = ({ text }: { text: string }) => (
  <Box flexDirection="row">
    <Text color={C.promptChar} bold>{F.pointer} </Text>
    <Text color={C.userText}>{text}</Text>
  </Box>
)

// ─── 组件：思考状态行（可折叠） ─────────────────────

const ThoughtBlock = ({
  durationMs,
  reasoning,
  expanded,
  onToggle,
  thinkStartTime,
}: {
  durationMs: number
  reasoning?: string
  expanded: boolean
  onToggle: () => void
  thinkStartTime?: Date
}) => {
  if (expanded && reasoning) {
    // ── 展开模式：∴ 图标即占位，与 ● 同列对齐 ──
    return (
      <Box flexDirection="column">
        {/* 思考内容（灰色），∴ 本身就是图标，等同于 ● */}
        <Box flexDirection="column">
          <Text color={C.thoughtDim}>
            <Text italic>{F.therefore} </Text>{reasoning}
          </Text>
        </Box>

        {/* 底部：时间 + 模型名 */}
        <Box justifyContent="flex-end" marginTop={0}>
          <Text color={C.thoughtDim}>
            {thinkStartTime ? formatTime(thinkStartTime) : formatTime()}{' '}{MODEL_NAME}
          </Text>
        </Box>
      </Box>
    )
  }

  // ── 折叠模式：纯文字提示（隐形图标占位，与 ● 后文字对齐） ──
  return (
    <Box flexDirection="row">
      {/* 隐形图标占位：宽度 = ● + 空格 */}
      <Text color={C.thoughtDim}>{'  '}</Text>
      <Text color={C.thoughtDim}>
        Thought for {formatDuration(durationMs)}{' '}
        (<Text bold>ctrl+o</Text> to expand)
      </Text>
    </Box>
  )
}

// ─── 组件：思考中动画 ──────────────────────────────

/** Claude Code 思考阶段的动态动词 */
const THINKING_VERBS = [
  'Propagating', 'Ruminating', 'Pondering', 'Cogitating',
  'Meditating', 'Mulling', 'Reflecting', 'Simulating',
]

const ThinkingAnimation = ({ elapsedMs }: { elapsedMs: number }) => {
  // 动词每 3 秒轮换一次
  const verbIndex = Math.floor(elapsedMs / 3000) % THINKING_VERBS.length
  const verb = THINKING_VERBS[verbIndex]
  const dots = '.'.repeat(Math.floor((elapsedMs / 400) % 4))

  return (
    <Box flexDirection="row">
      <Text color={C.claude}>
        {F.spinner} {verb}{dots} <Text color={C.thoughtDim}>({formatDuration(elapsedMs)} {F.middot} thinking)</Text>
      </Text>
    </Box>
  )
}

// ─── 组件：块状光标（仿 Claude Code invert(' ') 反色光标）──────
// Claude Code 使用 chalk.inverse（ANSI SGR 7 反色）渲染 invert(' ')，
// 将空格的前景/背景色互换，产生实心块状光标效果。
// 此处用 Ink 的 backgroundColor 模拟相同效果。
// 注意：Claude Code 的输入光标不闪烁，始终为静态反色块。

const BlockCursor = () => (
  <Text backgroundColor={C.text} color="black"> </Text>
)

// ─── 组件：命令建议列表（仿 Claude Code PromptInputFooterSuggestions 双列布局）──

const MAX_VISIBLE_SUGGESTIONS = 5
const COMMAND_COL_WIDTH = 28 // 命令名列固定宽度，保证描述左对齐
/** 匹配字符高亮色 */
const MATCH_HIGHLIGHT_COLOR = C.suggestion // 浅蓝紫，与选中色一致

/** 截断文本到指定显示宽度 */
function truncateToWidth(text: string, maxWidth: number): string {
  let width = 0
  for (let i = 0; i < text.length; i++) {
    width += stringWidth(text[i])
    if (width > maxWidth) {
      return text.slice(0, i).trimEnd() + '...'
    }
  }
  return text
}

/**
 * 高亮文本中匹配查询词的字符
 * 将 text 中所有匹配 query 的子串用指定颜色+粗体渲染
 */
function HighlightText({
  text,
  query,
  color,
  dim,
  bold,
}: {
  text: string
  query: string
  color?: string
  dim?: boolean
  bold?: boolean
}) {
  if (!query) {
    return <Text color={color} dim={dim} bold={bold}>{text}</Text>
  }

  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const parts: Array<{ text: string; isMatch: boolean }> = []
  let searchFrom = 0

  while (searchFrom < lowerText.length) {
    const idx = lowerText.indexOf(lowerQuery, searchFrom)
    if (idx === -1) {
      parts.push({ text: text.slice(searchFrom), isMatch: false })
      break
    }
    // 前面的非匹配部分
    if (idx > searchFrom) {
      parts.push({ text: text.slice(searchFrom, idx), isMatch: false })
    }
    // 匹配部分
    parts.push({ text: text.slice(idx, idx + query.length), isMatch: true })
    searchFrom = idx + query.length
  }

  return (
    <>
      {parts.map((part, i) => (
        <Text
          key={i}
          color={part.isMatch ? MATCH_HIGHLIGHT_COLOR : color}
          bold={part.isMatch ? true : bold}
          dim={!part.isMatch && dim}
        >
          {part.text}
        </Text>
      ))}
    </>
  )
}

/** 无匹配时的提示（仿 Claude Code "No commands match \"/xxx\""） */
const NoMatchHint = ({ input }: { input: string }) => (
  <Box paddingX={1}>
    <Text color={C.inactive} dim>
      No commands match <Text color={C.suggestion}>"{input}"</Text>
    </Text>
  </Box>
)

const CommandSuggestionList = ({
  suggestions,
  selectedIndex,
  query,
  input,
}: {
  suggestions: CommandSuggestion[]
  selectedIndex: number
  query: string
  /** 完整的输入字符串，用于无匹配时显示提示 */
  input: string
}) => {
  // 无匹配且有实际查询词时 → 显示 "No commands match"
  if (suggestions.length === 0 && isCommandInput(input) && hasCommandArgs(input) === false) {
    const q = getCommandQuery(input)
    if (q.length > 0) {
      return (
        <Box flexDirection="column">
          {/* 分隔线 */}
          <Box borderStyle="single" borderColor={C.hintDim} borderDimColor
            borderLeft={false} borderRight={false} borderTop={false} />
          <NoMatchHint input={`/${q}`} />
        </Box>
      )
    }
    return null
  }

  if (suggestions.length === 0) return null

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* 列头分隔线 */}
      <Box borderStyle="single" borderColor={C.hintDim} borderDimColor
        borderLeft={false} borderRight={false} borderTop={false} />
      {suggestions.slice(0, MAX_VISIBLE_SUGGESTIONS).map((suggestion, index) => {
        const cmd = suggestion.command
        const isSelected = index === selectedIndex
        const aliasText = suggestion.matchedAlias ? ` (${suggestion.matchedAlias})` : ''
        const displayName = `/${cmd.name}${aliasText}`
        const displayDesc = cmd.description
          ? truncateToWidth(cmd.description, Math.max(30, process.stdout.columns ?? 80) - COMMAND_COL_WIDTH - 6)
          : ''

        // 选中行：整行统一用 suggestion 色高亮；非选中行：命令名列用默认色，描述用 subtle
        const rowColor = isSelected ? C.suggestion : undefined
        const descColor = isSelected ? C.suggestion : C.subtle

        return (
          <Box key={cmd.name} flexDirection="row">
            {/* 左列：命令名（固定宽度）— 选中时整行高亮 */}
            <Box width={COMMAND_COL_WIDTH}>
              <HighlightText
                text={displayName}
                query={query}
                color={rowColor}
                bold={isSelected}
                dim={!isSelected}
              />
            </Box>
            {/* 右列：描述 — 选中时同样高亮，与左列风格一致 */}
            {displayDesc && (
              <HighlightText
                text={`  ${displayDesc}`}
                query={query}
                color={descColor}
                bold={isSelected}
                dim={!isSelected}
              />
            )}
          </Box>
        )
      })}
    </Box>
  )
}

// ─── 组件：参数提示（仿 Claude Code commandArgumentHint）──

const ArgumentHint = ({ hint }: { hint: string }) => (
  <Box paddingX={1}>
    <Text color={C.inactive} dim>{hint}</Text>
  </Box>
)

// ─── 简易 Markdown 渲染器（将 LLM 返回的 Markdown 转为 Ink Text 组件）────
// 支持：**bold**、*italic*、`code`、行内渲染

type MdSegment = { text: string; bold?: boolean; italic?: boolean; code?: boolean }

/** 将含 markdown 的纯文本拆分为分段，每段带样式标记 */
function parseInlineMarkdown(text: string): MdSegment[] {
  const segments: MdSegment[] = []
  // 正则：匹配 **bold**、*italic*、`code`（非贪婪，按优先级）
  const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)/gs
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    // 前面的普通文本
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index) })
    }
    if (match[1]) {
      // **bold**
      segments.push({ text: match[2], bold: true })
    } else if (match[3]) {
      // *italic*
      segments.push({ text: match[4], italic: true })
    } else if (match[5]) {
      // `code`
      segments.push({ text: match[6], code: true })
    }
    lastIndex = regex.lastIndex
  }
  // 尾部剩余文本
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex) })
  }
  return segments
}

/** 渲染 Markdown 文本为单行 Ink Text（内联拼接所有片段） */
const MarkdownText = ({ text, color }: { text: string; color?: string }) => {
  const segments = parseInlineMarkdown(text)
  // 所有片段作为 <Text> 的子元素行内拼接，保证换行宽度计算正确
  return (
    <Text>
      {segments.map((seg, i) => (
        <Text key={i} color={color} bold={seg.bold} italic={seg.italic} backgroundColor={seg.code ? 'rgb(60,60,60)' : undefined}>
          {seg.text}
        </Text>
      ))}
    </Text>
  )
}

// ─── 组件：AI 回复区域（含 ⎿ 缩进） ──────────────────

const AssistantResponse = ({
  msg,
  expanded,
  onToggleExpand,
}: {
  msg: ChatMessage
  expanded: boolean
  onToggleExpand: () => void
}) => {
  const isThinking = msg.state === 'thinking'
  const isStreaming = msg.state === 'responding'
  const isDone = msg.state === 'done'

  // 思考开始时间到现在的时长
  const [thinkElapsed, setThinkElapsed] = useState(0)
  // 固定完成动词（仅在首次进入 done 时生成一次）
  const [fixedVerb] = useState(() => pickVerb())

  useEffect(() => {
    if (isThinking && msg.thinkStartMs) {
      const interval = setInterval(() => {
        setThinkElapsed(Date.now() - msg.thinkStartMs!)
      }, 200)
      return () => clearInterval(interval)
    }
    setThinkElapsed(0)
  }, [isThinking, msg.thinkStartMs])

  return (
    <Box flexDirection="column">
      {/* ===== 思考状态行 / 展开的思考内容框 ===== */}
      {isThinking && (
        <ThinkingAnimation elapsedMs={thinkElapsed} />
      )}

      {(isStreaming || isDone) && msg.thinkDurationMs != null && (
        <ThoughtBlock
          durationMs={msg.thinkDurationMs!}
          reasoning={msg.reasoning}
          expanded={expanded}
          onToggle={onToggleExpand}
          thinkStartTime={msg.thinkStartMs ? new Date(msg.thinkStartMs) : undefined}
        />
      )}

      {/* ===== AI 回复内容（与思考框平级对齐，无额外缩进） ===== */}
      {(isStreaming || isDone) && (
        <Box flexDirection="column">
          <Box flexDirection="row">
            <Text color={C.bullet}>{F.bullet} </Text>
            <Box flexGrow={1}>
              <Text color={C.responseText}>
                {msg.content ? (
                  <MarkdownText text={msg.content} color={C.responseText} />
                ) : isStreaming ? '' : '(no content)'}
                {isStreaming && <Text dim>{F.cursor}</Text>}
              </Text>
            </Box>
          </Box>
        </Box>
      )}

      {/* ===== 完成状态行：✻ Worked for Xs ===== — ✻ 自身即图标，无需占位 */}
      {isDone && (
        <Box flexDirection="row" marginTop={1}>
          <Text color={C.workedDim} dim>
            {F.spinner} {fixedVerb} for {formatDuration(msg.totalDurationMs ?? msg.thinkDurationMs ?? 0)}
          </Text>
        </Box>
      )}
    </Box>
  )
}

// ─── 组件：单条消息渲染 ──────────────────────────────

const MessageBlock = ({
  msg,
  expanded,
  onToggleExpand,
}: {
  msg: ChatMessage
  expanded: boolean
  onToggleExpand: () => void
}) => {
  if (msg.role === 'user') {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <UserMessageLine text={msg.content} />
      </Box>
    )
  }

  // assistant message
  return (
    <Box flexDirection="column" marginBottom={1}>
      <AssistantResponse msg={msg} expanded={expanded} onToggleExpand={onToggleExpand} />
    </Box>
  )
}

// ─── 组件：底部输入栏（仿 Claude Code PromptInputFooter） ──

const PromptInputBar = ({
  value,
  loading,
  tokenUsage,
  suggestions,
  selectedSuggestion,
  argumentHint,
  commandQuery,
}: {
  value: string
  loading: boolean
  tokenUsage: TokenUsage
  suggestions: CommandSuggestion[]
  selectedSuggestion: number
  argumentHint?: string
  commandQuery: string
}) => {
  return (
    <Box flexDirection="column">
      {/* 分隔线：只显示顶部边框，与 Claude Code 源码中的 PermissionDialog 同一方式 */}
      <Box
        borderStyle="single"
        borderColor={C.hintDim}
        borderDimColor
        borderLeft={false}
        borderRight={false}
        borderBottom={false}
      />

      {/* ❯ 提示符 + 输入内容（独立行） */}
      {/* 仿 Claude Code TextInput：invert(' ') 反色块状光标，始终可见 */}
      <Box flexDirection="row" paddingX={1}>
        <Text color={C.promptChar} dimColor={loading}>{`${F.pointer} `}</Text>
        {value.length > 0 ? (
          <Text>{value}<BlockCursor /></Text>
        ) : loading ? (
          <Text color={C.hintDim} dim>waiting for response...</Text>
        ) : (
          <BlockCursor />
        )}
      </Box>

      {/* 命令建议列表 / 无匹配提示（仿 Claude Code PromptInputFooterSuggestions） */}
      {isCommandInput(value) && (
        <CommandSuggestionList suggestions={suggestions} selectedIndex={selectedSuggestion} query={commandQuery} input={value} />
      )}

      {/* 参数提示 */}
      {argumentHint && <ArgumentHint hint={argumentHint} />}

      {/* 分隔线：> 提示行与底部区域 — 斜杠命令时由 CommandSuggestionList 自带，此处不重复绘制 */}
      {!isCommandInput(value) && (
        <Box
          borderStyle="single"
          borderColor={C.hintDim}
          borderDimColor
          borderLeft={false}
          borderRight={false}
          borderTop={false}
        />
      )}

      {/* 提示栏：? for shortcuts · -- for agents — 仅输入框为空时显示 */}
      {value.length === 0 && (
        <Box flexDirection="row" paddingX={1} paddingBottom={1}>
          <Text color={C.hintDim} dim>? for shortcuts {F.middot} -- for agents</Text>
        </Box>
      )}
    </Box>
  )
}

// ─── 主应用 ──────────────────────────────────────

const App = () => {
  const { exit } = useApp()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  })
  // 已展开思考内容的消息 ID 集合
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())
  const nextId = useRef(1)
  const scrollRef = useRef<any>(null)

  // ─── 斜杠命令 UI 状态 ───
  const [commandSuggestions, setCommandSuggestions] = useState<CommandSuggestion[]>([])
  const [selectedSuggestion, setSelectedSuggestion] = useState(-1)
  const [argumentHint, setArgumentHint] = useState<string | undefined>(undefined)

  // ─── 输入变化时更新建议 ───
  const updateSuggestions = useCallback((value: string) => {
    if (!isCommandInput(value) || hasCommandArgs(value)) {
      setCommandSuggestions([])
      setSelectedSuggestion(-1)
      setArgumentHint(undefined)
      return
    }

    // 更新建议列表
    const suggestions = generateCommandSuggestions(value)
    setCommandSuggestions(suggestions)
    setSelectedSuggestion(suggestions.length > 0 ? 0 : -1)

    // 更新参数提示：命令名后恰好有一个空格时
    const spaceIndex = value.indexOf(' ')
    const hasTrailingSpace = spaceIndex !== -1 && value.length === spaceIndex + 1
    if (hasTrailingSpace) {
      const cmdName = value.slice(1, spaceIndex).toLowerCase()
      const cmd = SLASH_COMMANDS.find(c => c.name.toLowerCase() === cmdName)
        ?? SLASH_COMMANDS.find(c => c.aliases?.some(a => a.toLowerCase() === cmdName))
      if (cmd?.argumentHint) {
        setArgumentHint(cmd.argumentHint)
      } else {
        setArgumentHint(undefined)
      }
    } else {
      setArgumentHint(undefined)
    }
  }, [])

  // ─── 清除建议 ───
  const clearSuggestions = useCallback(() => {
    setCommandSuggestions([])
    setSelectedSuggestion(-1)
    setArgumentHint(undefined)
  }, [])

  // ─── 应用命令补全（Tab 或 Enter 选中时） ───
  const applyCommandCompletion = useCallback((
    suggestion: CommandSuggestion,
    shouldExecute: boolean,
  ) => {
    const cmdName = suggestion.command.name
    const newInput = `/${cmdName} `
    setInput(newInput)
    clearSuggestions()

    // 如果需要执行且命令无参数 → 直接提交
    if (shouldExecute) {
      const parsed = parseSlashCommand(newInput)
      if (parsed) {
        sendMessage(parsed.command.prompt)
      }
    }
  }, [clearSuggestions])

  // 切换某条消息的思考内容展开状态
  const toggleExpand = useCallback((msgId: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(msgId)) {
        next.delete(msgId)
      } else {
        next.add(msgId)
      }
      return next
    })
  }, [])

  // 找到最后一条 assistant 消息的 ID（用于 ctrl+o）
  const lastAssistantId = messages.filter(m => m.role === 'assistant').pop()?.id

  // 发送消息
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return

    const userMsg: ChatMessage = {
      id: nextId.current++,
      role: 'user',
      content: text.trim(),
      state: 'done',
    }

    const assistantId = nextId.current++
    const thinkStart = Date.now()
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      reasoning: '',
      state: 'thinking',
      thinkStartMs: thinkStart,
    }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setInput('')
    setLoading(true)
    clearSuggestions()

    const history = [...messages, userMsg].map(m => ({
      role: m.role,
      content: m.content,
    }))

    let thinkEndTime: number | null = null

    await streamChat(
      [
        { role: 'system', content: 'You are a helpful assistant. Reply concisely.' },
        ...history,
      ],
      // onThinking - 进入思考阶段
      () => {
        /* thinking phase already set initially */
      },
      // onChunk - 流式更新
      (content, reasoning) => {
        const newState: TurnState = content.length > 0 ? 'responding' : 'thinking'
        if (newState === 'responding' && !thinkEndTime) {
          thinkEndTime = Date.now()
        }
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId
              ? {
                  ...m,
                  content,
                  reasoning,
                  state: newState,
                  thinkDurationMs: thinkEndTime
                    ? thinkEndTime - (m.thinkStartMs ?? thinkEndTime)
                    : undefined,
                }
              : m,
          ),
        )
      },
      // onDone
      (content, reasoning, usage) => {
        const doneTime = Date.now()
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId
              ? {
                  ...m,
                  content,
                  reasoning,
                  state: 'done',
                  thinkDurationMs: (thinkEndTime ?? doneTime) - (m.thinkStartMs ?? doneTime),
                  totalDurationMs: doneTime - (m.thinkStartMs ?? doneTime),
                  usage,
                }
              : m,
          ),
        )
        if (usage) {
          setTokenUsage(prev => ({
            promptTokens: prev.promptTokens + usage.promptTokens,
            completionTokens: prev.completionTokens + usage.completionTokens,
            totalTokens: prev.totalTokens + usage.totalTokens,
          }))
        }
        setLoading(false)
      },
      // onError
      err => {
        const failTime = Date.now()
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId
              ? {
                  ...m,
                  content: `Error: ${err.message}`,
                  state: 'done',
                  thinkDurationMs: failTime - (assistantMsg.thinkStartMs ?? failTime),
                  totalDurationMs: failTime - (assistantMsg.thinkStartMs ?? failTime),
                }
              : m,
          ),
        )
        setLoading(false)
      },
    )
  }, [messages, loading, clearSuggestions])

  // 键盘输入处理
  useInput((inputKey, key) => {
    if (key.ctrl && inputKey === 'c') {
      exit()
      return
    }

    if (key.ctrl && inputKey === 'l') {
      setMessages([])
      setTokenUsage({ promptTokens: 0, completionTokens: 0, totalTokens: 0 })
      return
    }

    // Ctrl+O：展开/折叠最新消息的思考内容
    if (key.ctrl && inputKey === 'o' && lastAssistantId != null) {
      toggleExpand(lastAssistantId)
      return
    }

    // ─── Tab 键补全（仿 Claude Code useTypeahead handleTab） ───
    if (key.tab) {
      // 有建议列表时：应用选中的建议（补全但不执行）
      if (commandSuggestions.length > 0) {
        const idx = selectedSuggestion === -1 ? 0 : selectedSuggestion
        const suggestion = commandSuggestions[idx]
        if (suggestion) {
          applyCommandCompletion(suggestion, false)
        }
        return
      }

      return
    }

    // ─── 上下键导航建议列表 ───
    if (key.upArrow) {
      if (commandSuggestions.length > 0) {
        setSelectedSuggestion(prev =>
          prev <= 0 ? commandSuggestions.length - 1 : prev - 1,
        )
        return
      }
    }

    if (key.downArrow) {
      if (commandSuggestions.length > 0) {
        setSelectedSuggestion(prev =>
          prev >= commandSuggestions.length - 1 ? 0 : prev + 1,
        )
        return
      }
    }

    // ─── Enter 键执行 ───
    if (key.return) {
      if (!input.trim() || loading) return

      // 有建议选中时：应用并执行
      if (commandSuggestions.length > 0 && selectedSuggestion >= 0) {
        const suggestion = commandSuggestions[selectedSuggestion]
        if (suggestion) {
          applyCommandCompletion(suggestion, true)
          return
        }
      }

      // 斜杠命令：解析并提取 prompt
      if (isCommandInput(input)) {
        const parsed = parseSlashCommand(input)
        if (parsed) {
          sendMessage(parsed.command.prompt)
        } else {
          // 未知命令 → 当作普通文本发送
          sendMessage(input)
        }
        return
      }

      // 普通文本
      sendMessage(input)
      return
    }

    if (key.backspace || key.delete) {
      setInput(prev => {
        const newVal = prev.slice(0, -1)
        // 退格后更新建议
        updateSuggestions(newVal)
        return newVal
      })
      return
    }

    // 普通字符
    if (inputKey && !key.ctrl && !key.meta && !key.return) {
      setInput(prev => {
        const newVal = prev + inputKey
        // 输入后更新建议
        updateSuggestions(newVal)
        return newVal
      })
    }
  })

  return (
    <Box flexDirection="column" height="100%">
      {/* ===== 顶部欢迎栏 ===== */}
      <WelcomeBanner />

      {/* ===== 消息区域（ScrollBox） ===== */}
      <Box flexDirection="column" flexGrow={1}>
        <ScrollBox ref={scrollRef} stickyScroll>
          {messages.length === 0 ? (
            <Box paddingY={2} paddingX={1}>
              <Text color={C.hintDim} dim>Type a message to get started...</Text>
            </Box>
          ) : (
            <Box flexDirection="column" paddingX={0} paddingY={1}>
              {messages.map(msg => (
                <MessageBlock
                  key={msg.id}
                  msg={msg}
                  expanded={expandedIds.has(msg.id)}
                  onToggleExpand={() => toggleExpand(msg.id)}
                />
              ))}
            </Box>
          )}
        </ScrollBox>
      </Box>

      {/* ===== 底部输入栏（固定） ===== */}
      <PromptInputBar
        value={input}
        loading={loading}
        tokenUsage={tokenUsage}
        suggestions={commandSuggestions}
        selectedSuggestion={selectedSuggestion}
        argumentHint={argumentHint}
        commandQuery={isCommandInput(input) ? getCommandQuery(input) : ''}
      />
    </Box>
  )
}

// ─── 入口 ────────────────────────────────────────

render(<App />)
