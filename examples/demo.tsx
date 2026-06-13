/**
 * smink 综合示例 - Todo 应用
 *
 * 功能演示：
 *   - Box/Text 布局与样式
 *   - useInput 键盘交互
 *   - useApp 退出控制
 *   - Button 组件
 *   - ScrollBox 可滚动列表
 *   - Flexbox 布局
 *   - 状态管理
 *   - 动态渲染
 *
 * 快捷键：
 *   a     - 添加新待办
 *   d     - 删除选中项
 *   ↑/k   - 上移光标
 *   ↓/j   - 下移光标
 *   空格  - 切换完成状态
 *   q/Esc - 退出
 */

import React, { useState, useCallback, useRef } from 'react'
import {
  render,
  Box,
  Text,
  Button,
  Newline,
  Spacer,
  useInput,
  useApp,
  ScrollBox,
} from '../src/index.js'

// ─── 类型 ────────────────────────────────────────

type Todo = {
  id: number
  text: string
  done: boolean
}

// ─── 色彩常量 ────────────────────────────────────

const COLORS = {
  primary: 'ansi:cyan',
  success: 'ansi:green',
  danger: 'ansi:red',
  muted: 'ansi:white',
  accent: 'ansi:yellow',
  dimMuted: 'ansi:blackBright',
  bg: 'ansi256(234)',
  bgHighlight: 'ansi256(237)',
  border: 'ansi256(60)',
}

// ─── 子组件 ──────────────────────────────────────

/** 单个待办项 */
const TodoItem = ({
  todo,
  selected,
  index,
  onToggle,
}: {
  todo: Todo
  selected: boolean
  index: number
  onToggle: () => void
}) => {
  const checkbox = todo.done ? '✓' : '○'
  const textColor = todo.done ? COLORS.dimMuted : undefined
  const textDecor = todo.done ? 'strikethrough' as const : undefined

  return (
    <Box
      paddingX={1}
      backgroundColor={selected ? COLORS.bgHighlight : undefined}
    >
      <Text color={COLORS.dimMuted}>{String(index + 1).padStart(2, ' ')} </Text>
      <Text
        color={todo.done ? COLORS.success : COLORS.accent}
        bold={!todo.done}
      >
        {checkbox}{' '}
      </Text>
      <Text
        color={textColor}
        strikethrough={textDecor === 'strikethrough'}
      >
        {todo.text}
      </Text>
      {selected && (
        <Text color={COLORS.primary}> ←</Text>
      )}
    </Box>
  )
}

/** 状态栏 */
const StatusBar = ({ todos, cursor }: { todos: Todo[]; cursor: number }) => {
  const done = todos.filter(t => t.done).length
  const total = todos.length
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  const barLen = 20
  const filled = Math.round((done / Math.max(total, 1)) * barLen)
  const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled)

  return (
    <Box
      borderTop
      borderColor={COLORS.border}
      paddingX={1}
      gap={1}
    >
      <Text color={COLORS.muted}>进度:</Text>
      <Text color={COLORS.success}>{bar}</Text>
      <Text color={COLORS.muted}>{pct}%</Text>
      <Text color={COLORS.dimMuted}>({done}/{total})</Text>
      <Spacer />
      <Text color={COLORS.dimMuted}>
        行 {cursor + 1}/{total}
      </Text>
    </Box>
  )
}

/** 快捷键提示 */
const HelpBar = () => (
  <Box
    borderTop
    borderColor={COLORS.border}
    paddingX={1}
    gap={1}
  >
    <Text color={COLORS.primary} bold>a</Text>
    <Text color={COLORS.dimMuted}>添加</Text>
    <Text color={COLORS.danger} bold>d</Text>
    <Text color={COLORS.dimMuted}>删除</Text>
    <Text color={COLORS.accent} bold>␣</Text>
    <Text color={COLORS.dimMuted}>完成</Text>
    <Text color={COLORS.muted} bold>↑↓</Text>
    <Text color={COLORS.dimMuted}>移动</Text>
    <Spacer />
    <Text color={COLORS.dimMuted}>q 退出</Text>
  </Box>
)

/** 输入框 - 模拟简易文本输入 */
const InputBox = ({
  onSubmit,
  onCancel,
}: {
  onSubmit: (text: string) => void
  onCancel: () => void
}) => {
  const [value, setValue] = useState('')

  useInput((input, key) => {
    if (key.escape) {
      onCancel()
      return
    }
    if (key.return) {
      if (value.trim()) {
        onSubmit(value.trim())
      }
      return
    }
    if (key.backspace || key.delete) {
      setValue(prev => prev.slice(0, -1))
      return
    }
    // 普通字符
    if (input && !key.ctrl && !key.meta) {
      setValue(prev => prev + input)
    }
  })

  return (
    <Box
      borderStyle="round"
      borderColor={COLORS.primary}
      paddingX={1}
    >
      <Text color={COLORS.primary} bold>✎ </Text>
      <Text>{value}</Text>
      <Text color={COLORS.primary} inverse>▎</Text>
      <Text color={COLORS.dimMuted}> Enter确认 / Esc取消</Text>
    </Box>
  )
}

// ─── 主应用 ──────────────────────────────────────

const App = () => {
  const { exit } = useApp()

  // 待办列表初始数据
  const [todos, setTodos] = useState<Todo[]>([
    { id: 1, text: '学习 smink 框架', done: true },
    { id: 2, text: '用 React 写终端应用', done: false },
    { id: 3, text: '探索 Flexbox 布局', done: false },
    { id: 4, text: '尝试 ScrollBox 滚动', done: false },
    { id: 5, text: '自定义组件样式', done: false },
  ])

  const [cursor, setCursor] = useState(0)
  const [adding, setAdding] = useState(false)
  const nextId = useRef(6)

  // 键盘交互（非输入模式）
  useInput((input, key) => {
    if (adding) return // 输入模式下忽略

    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit()
      return
    }

    if (input === 'a') {
      setAdding(true)
      return
    }

    if (input === 'd' && todos.length > 0) {
      setTodos(prev => {
        const next = prev.filter((_, i) => i !== cursor)
        // 调整光标
        if (cursor >= next.length && cursor > 0) {
          setCursor(next.length - 1)
        }
        return next
      })
      return
    }

    if (input === ' ' && todos.length > 0) {
      setTodos(prev =>
        prev.map((t, i) =>
          i === cursor ? { ...t, done: !t.done } : t,
        ),
      )
      return
    }

    // 上下移动
    if ((key.upArrow || input === 'k') && cursor > 0) {
      setCursor(c => c - 1)
    }
    if ((key.downArrow || input === 'j') && cursor < todos.length - 1) {
      setCursor(c => c + 1)
    }
  })

  const handleAdd = useCallback((text: string) => {
    setTodos(prev => [...prev, { id: nextId.current++, text, done: false }])
    setCursor(prev => prev + 1) // 移到新增项
    setAdding(false)
  }, [])

  const handleCancelAdd = useCallback(() => {
    setAdding(false)
  }, [])

  return (
    <Box flexDirection="column" padding={1}>
      {/* 标题 */}
      <Box
        borderStyle="bold"
        borderColor={COLORS.primary}
        paddingX={1}
        justifyContent="center"
      >
        <Text color={COLORS.primary} bold>📋 smink Todo 示例</Text>
      </Box>

      {/* 输入框（添加模式时显示） */}
      {adding && (
        <Box marginTop={1}>
          <InputBox onSubmit={handleAdd} onCancel={handleCancelAdd} />
        </Box>
      )}

      {/* 待办列表 */}
      <Box
        flexDirection="column"
        marginTop={1}
        borderStyle="single"
        borderColor={COLORS.border}
        minHeight={10}
      >
        {todos.length === 0 ? (
          <Box padding={1} justifyContent="center">
            <Text color={COLORS.dimMuted} italic>
              暂无待办，按 a 添加
            </Text>
          </Box>
        ) : (
          <ScrollBox stickyScroll>
            {todos.map((todo, i) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                selected={i === cursor && !adding}
                index={i}
                onToggle={() => {
                  setTodos(prev =>
                    prev.map((t, idx) =>
                      idx === i ? { ...t, done: !t.done } : t,
                    ),
                  )
                }}
              />
            ))}
          </ScrollBox>
        )}
      </Box>

      {/* 状态栏 */}
      <StatusBar todos={todos} cursor={cursor} />

      {/* 快捷键提示 */}
      <HelpBar />
    </Box>
  )
}

// ─── 入口 ────────────────────────────────────────

render(<App />)
