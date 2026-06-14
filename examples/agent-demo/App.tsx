/**
 * 主应用组件
 * Claude Code Style Terminal UI - 仿 Claude Code 终端界面
 *
 * 快捷键：
 *   Enter    - 发送消息
 *   Ctrl+C   - 退出
 *   Ctrl+L   - 清空对话
 *   Ctrl+O   - 展开/折叠最新消息的思考内容
 */

import React, { useState, useRef, useCallback } from 'react'
import { Box, Text, ScrollBox, useInput, useApp } from '../../src/index.js'
import { C } from './theme/colors.js'
import { WelcomeBanner } from './component/WelcomeBanner.js'
import { MessageBlock } from './component/MessageBlock.js'
import { PromptInputBar } from './component/PromptInputBar.js'
import { streamChat } from './api.js'
import {
  isCommandInput,
  getCommandQuery,
  hasCommandArgs,
  generateCommandSuggestions,
  parseSlashCommand,
  SLASH_COMMANDS,
} from './component/slash-commands.js'
import type { TokenUsage, TurnState, ChatMessage, CommandSuggestion } from './component/types.js'

export const App = () => {
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
      />
    </Box>
  )
}
