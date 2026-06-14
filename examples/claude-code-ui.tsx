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
  Spacer,
  ScrollBox,
  useInput,
  useApp,
} from '../src/index.js'
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

// ─── Claude Code 风格色彩方案 ─────────────────────

// 尽量贴近 Claude Code 终端的暗色调
const C = {
  // 用户消息 - 白色/亮色
  userText: 'ansi:white',

  // 思考状态文字 - 灰色 dim（核心特征）
  thoughtDim: 'ansi:blackBright',

  // AI 回复正文 - 默认白色
  responseText: 'ansi:white',

  // 提示符 ❯
  promptChar: 'ansi:white',

  // 缩进符号 ⎿
  indentBracket: 'ansi:blackBright',

  // 项目符号 ●
  bullet: 'ansi:white',

  // 完成状态 ✻ — 灰色
  workedDim: 'ansi:blackBright',

  // ✻ Spinner 图标 — Claude 品牌橙 rgb(215,119,87)
  claude: 'ansi256(215)',

  // 底部提示栏
  hintDim: 'ansi:blackBright',

  // 标题栏
  titleText: 'ansi:red',       // Claude Code 用红色标题
  titleDim: 'ansi:blackBright',

  // 错误
  error: 'ansi:red',
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
            <Text color={C.responseText}>
              {msg.content || (isStreaming ? '' : '(no content)')}
              {isStreaming && <Text dim>{F.cursor}</Text>}
            </Text>
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
}: {
  value: string
  loading: boolean
  tokenUsage: TokenUsage
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
      <Box flexDirection="row" paddingX={1}>
        <Text color={C.promptChar} dimColor={loading}>{`${F.pointer} `}</Text>
        <Spacer />
        {value.length > 0 ? (
          <Text>{value}<Text dim>{F.cursor}</Text></Text>
        ) : (
          <Text color={C.hintDim} dim>
            {/* 空时不显示占位文本，保持简洁 */}
            {loading ? 'waiting for response...' : ''}
          </Text>
        )}
      </Box>

      {/* 分隔线：> 提示行与提示栏之间（仅底部边框） */}
      <Box
        borderStyle="single"
        borderColor={C.hintDim}
        borderDimColor
        borderLeft={false}
        borderRight={false}
        borderTop={false}
      />

      {/* 提示栏：? for shortcuts · -- for agents */}
      <Box flexDirection="row" paddingX={1} paddingBottom={1}>
        <Text color={C.hintDim} dim>? for shortcuts {F.middot} -- for agents</Text>
      </Box>
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
  }, [messages, loading])

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

    if (key.return) {
      if (input.trim() && !loading) {
        sendMessage(input)
      }
      return
    }

    if (key.backspace || key.delete) {
      setInput(prev => prev.slice(0, -1))
      return
    }

    // 普通字符
    if (inputKey && !key.ctrl && !key.meta && !key.return) {
      setInput(prev => prev + inputKey)
    }
  })

  return (
    <Box flexDirection="column" height="100%">
      {/* ===== 顶部标题栏（仿 Claude Code Welcome） ===== */}
      <Box
        flexDirection="column"
        borderBottom
        borderColor={C.titleDim}
        borderStyle="single"
        paddingX={1}
      >
        <Box justifyContent="space-between" alignItems="center">
          <Box flexDirection="row" alignItems="center" gap={1}>
            <Text color={C.titleText} bold>Claude Code</Text>
            <Text color={C.titleDim}>v2.1.175</Text>
          </Box>
          <Text color={C.titleDim}>deepseek-v4-pro [im] · API Usage Billing/workspace</Text>
        </Box>
        <Box marginTop={1} marginBottom={1}>
          <Text color={C.titleDim}>Welcome back!</Text>
        </Box>
        <Box flexDirection="column" marginBottom={1}>
          <Text color={C.titleDim}>Tips for getting started</Text>
          <Text color={C.titleDim} dim>Run /init to create a CLAUDE.md file with instructions for Claude</Text>
        </Box>
      </Box>

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
      <PromptInputBar value={input} loading={loading} tokenUsage={tokenUsage} />
    </Box>
  )
}

// ─── 入口 ────────────────────────────────────────

render(<App />)
