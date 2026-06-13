/**
 * smink AI Chat - 与大模型交互的终端聊天界面
 *
 * 功能：
 *   - 输入框固定在终端底部
 *   - 流式显示 AI 回复
 *   - 自动滚动到最新消息
 *   - 支持 reasoning_content（思维链）显示
 *
 * 快捷键：
 *   Enter  - 发送消息
 *   Ctrl+C - 退出
 *   Ctrl+L - 清空对话
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

// ─── 类型 ────────────────────────────────────────

type TokenUsage = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

type ChatMessage = {
  id: number
  role: 'user' | 'assistant' | 'system'
  content: string
  reasoning?: string
  streaming?: boolean
  usage?: TokenUsage
}

// ─── 色彩 ────────────────────────────────────────

const C = {
  primary: 'ansi:cyan',
  user: 'ansi:green',
  assistant: 'ansi:magenta',
  thinking: 'ansi:yellow',
  dim: 'ansi:blackBright',
  border: 'ansi256(60)',
  bg: 'ansi256(234)',
  bgInput: 'ansi256(237)',
  error: 'ansi:red',
  accent: 'ansi:yellow',
}

// ─── API 调用 ────────────────────────────────────

async function streamChat(
  messages: Array<{ role: string; content: string }>,
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
    let usage: TokenUsage | undefined

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta
      if (delta) {
        if (delta.reasoning_content) {
          fullReasoning += delta.reasoning_content
        }
        if (delta.content) {
          fullContent += delta.content
        }
      }
      // 捕获 usage（最后一个 chunk 包含）
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

// ─── 消息气泡 ────────────────────────────────────

const MessageBubble = ({ msg }: { msg: ChatMessage }) => {
  const isUser = msg.role === 'user'
  const color = isUser ? C.user : C.assistant
  const label = isUser ? '你' : 'AI'
  const icon = isUser ? '▸' : '◆'

  return (
    <Box flexDirection="column" marginY={0}>
      {/* 标签 */}
      <Box gap={1}>
        <Text color={color} bold>{icon} {label}</Text>
        {msg.streaming && (
          <Text color={C.thinking}>思考中...</Text>
        )}
      </Box>

      {/* 思维链（折叠显示） */}
      {msg.reasoning && !isUser && (
        <Box marginLeft={2} flexDirection="column">
          <Text color={C.thinking} dim>
            💭 {msg.reasoning.length > 200
              ? msg.reasoning.slice(0, 200) + '...'
              : msg.reasoning}
          </Text>
        </Box>
      )}

      {/* 内容 */}
      <Box marginLeft={2} flexDirection="column">
        <Text>{msg.content || (msg.streaming ? '...' : '')}</Text>
      </Box>
    </Box>
  )
}

// ─── 输入框 ──────────────────────────────────────

const InputBar = ({
  value,
  onChange,
  onSubmit,
  disabled,
  tokenUsage,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  disabled: boolean
  tokenUsage: TokenUsage
}) => {
  const placeholder = disabled ? '等待回复中...' : '输入消息，按 Enter 发送'

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* 输入框 */}
      <Box
        borderStyle="round"
        borderColor={disabled ? C.dim : C.primary}
        paddingX={1}
      >
        <Text color={C.primary} bold>{'❯ '}</Text>
        {value.length > 0 ? (
          <Text>{value}{'▎'}</Text>
        ) : (
          <>
            <Text color={C.dim}>{placeholder}</Text>
            <Text color={C.primary} inverse>{'▎'}</Text>
          </>
        )}
      </Box>
      {/* 状态栏 */}
      <Box justifyContent="space-between" paddingX={1}>
        <Text color={C.dim}>
          {tokenUsage.totalTokens > 0
            ? `📥 ${tokenUsage.promptTokens}  📤 ${tokenUsage.completionTokens}  📊 ${tokenUsage.totalTokens} tokens`
            : ''}
        </Text>
        <Text color={C.dim}>
          {disabled ? '⏳ 等待回复中' : 'Enter 发送'}
        </Text>
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
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({ promptTokens: 0, completionTokens: 0, totalTokens: 0 })
  const nextId = useRef(1)
  const scrollRef = useRef<any>(null)

  // 发送消息
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return

    const userMsg: ChatMessage = {
      id: nextId.current++,
      role: 'user',
      content: text.trim(),
    }
    const assistantId = nextId.current++
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      reasoning: '',
      streaming: true,
    }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setInput('')
    setLoading(true)

    // 构建消息历史
    const history = [...messages, userMsg].map(m => ({
      role: m.role,
      content: m.content,
    }))

    // 流式请求
    await streamChat(
      [
        { role: 'system', content: 'You are a helpful assistant. 回复简洁明了。' },
        ...history,
      ],
      // onChunk - 实时更新
      (content, reasoning) => {
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId
              ? { ...m, content, reasoning, streaming: true }
              : m,
          ),
        )
      },
      // onDone - 完成流式
      (content, reasoning, usage) => {
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId
              ? { ...m, content, reasoning, streaming: false, usage }
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
      (err) => {
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId
              ? { ...m, content: `❌ 错误: ${err.message}`, streaming: false }
              : m,
          ),
        )
        setLoading(false)
      },
    )
  }, [messages, loading])

  // 键盘输入
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

    // Enter 发送
    if (key.return) {
      if (input.trim() && !loading) {
        sendMessage(input)
      }
      return
    }

    // 退格
    if (key.backspace || key.delete) {
      setInput(prev => prev.slice(0, -1))
      return
    }

    // 普通字符输入（非控制键）
    if (inputKey && !key.ctrl && !key.meta && !key.return) {
      setInput(prev => prev + inputKey)
    }
  })

  return (
    <Box flexDirection="column" height="100%" padding={1}>
      {/* 标题栏 */}
      <Box
        borderStyle="bold"
        borderColor={C.primary}
        paddingX={1}
        justifyContent="space-between"
      >
        <Text color={C.primary} bold>🤖 DeepSeek Chat</Text>
        <Text color={C.dim}>Ctrl+L 清空 │ Ctrl+C 退出</Text>
      </Box>

      {/* 消息区域 */}
      <Box
        flexDirection="column"
        flexGrow={1}
        borderStyle="single"
        borderColor={C.border}
        marginTop={1}
      >
        <ScrollBox ref={scrollRef} stickyScroll>
          {messages.length === 0 ? (
            <Box padding={2} justifyContent="center" alignItems="center">
              <Text color={C.dim} italic>
                输入消息开始对话...
              </Text>
            </Box>
          ) : (
            <Box flexDirection="column" padding={1}>
              {messages.map(msg => (
                <MessageBubble key={msg.id} msg={msg} />
              ))}
            </Box>
          )}
        </ScrollBox>
      </Box>

      {/* 输入框 - 固定底部 */}
        <InputBar
          value={input}
          onChange={setInput}
          onSubmit={() => sendMessage(input)}
          disabled={loading}
          tokenUsage={tokenUsage}
        />
    </Box>
  )
}

// ─── 入口 ────────────────────────────────────────

render(<App />)
