/**
 * smink 组合键捕获示例
 *
 * 捕获并显示每个按键的完整信息，用于诊断按键解析问题（如 Shift+Tab、
 * Ctrl+方向键等修饰键组合在终端实际发来的字节序列）。
 *
 * 显示字段：
 *   - 显示名：人类可读的按键名（如 "Shift+Tab"、"Ctrl+C"、"↑"）
 *   - input：useInput 回调的 input 参数（JSON 转义）
 *   - key flags：tab/shift/ctrl/meta/return/escape/upArrow 等布尔位
 *   - 原始字节：终端实际发来的字节序列（charCode 数组 + 转义形式）
 *
 * 快捷键：
 *   任意键  - 捕获并显示
 *   c       - 清空历史
 *   q/Esc   - 退出
 */

import React, { useState } from 'react'
import { render, Box, Text, useInput, useApp, ScrollBox } from '../src/index.js'
import type { Key, InputEvent } from '../src/index.js'
import { env } from '../src/utils/env.js'
import { supportsExtendedKeys } from '../src/ink/terminal.js'

// ─── 类型 ────────────────────────────────────────

/** 单次按键捕获记录 */
interface KeyRecord {
  /** 序号（递增） */
  seq: number
  /** 人类可读的显示名 */
  label: string
  /** useInput 的 input 参数 */
  input: string
  /** key 对象的关键布尔字段 */
  flags: string
  /** 终端原始字节序列（charCode 数组） */
  bytes: string
  /** 终端原始字节序列（转义字符串） */
  raw: string
}

// ─── 工具函数 ────────────────────────────────────

/**
 * 把 key 对象转成人类可读的按键显示名
 *
 * 修饰键前缀按 Ctrl → Alt → Shift 顺序拼接；键名优先用特殊键名，
 * 回退到 input 字符。
 */
function formatLabel(input: string, key: Key): string {
  const parts: string[] = []
  if (key.ctrl) parts.push('Ctrl')
  if (key.meta) parts.push('Alt')
  if (key.shift) parts.push('Shift')

  let name: string
  if (key.upArrow) name = '↑'
  else if (key.downArrow) name = '↓'
  else if (key.leftArrow) name = '←'
  else if (key.rightArrow) name = '→'
  else if (key.return) name = 'Enter'
  else if (key.escape) name = 'Esc'
  else if (key.tab) name = 'Tab'
  else if (key.backspace) name = 'Backspace'
  else if (key.delete) name = 'Delete'
  else if (key.pageUp) name = 'PageUp'
  else if (key.pageDown) name = 'PageDown'
  else if (key.home) name = 'Home'
  else if (key.end) name = 'End'
  else if (input === ' ') name = 'Space'
  else name = input === '' ? '<空>' : input

  return [...parts, name].join('+')
}

/**
 * 把 key 的布尔字段压缩成紧凑的标记串（仅列出为 true 的）
 */
function formatFlags(key: Key): string {
  const on: string[] = []
  if (key.upArrow) on.push('up')
  if (key.downArrow) on.push('down')
  if (key.leftArrow) on.push('left')
  if (key.rightArrow) on.push('right')
  if (key.return) on.push('return')
  if (key.escape) on.push('escape')
  if (key.tab) on.push('tab')
  if (key.backspace) on.push('backspace')
  if (key.delete) on.push('delete')
  if (key.pageUp) on.push('pageUp')
  if (key.pageDown) on.push('pageDown')
  if (key.home) on.push('home')
  if (key.end) on.push('end')
  if (key.ctrl) on.push('ctrl')
  if (key.shift) on.push('shift')
  if (key.meta) on.push('meta')
  return on.length === 0 ? '—' : on.join('|')
}

/**
 * 把字符串转成 charCode 数组（用于显示终端原始字节）
 */
function toBytes(s: string | undefined): string {
  if (!s) return '[]'
  const codes = [...s].map((c) => c.charCodeAt(0))
  // 同时显示十进制与常见转义名（如 27=ESC, 9=TAB, 13=CR）
  const annotated = codes.map((n) => {
    const names: Record<number, string> = {
      9: 'TAB',
      10: 'LF',
      13: 'CR',
      27: 'ESC',
      127: 'DEL',
    }
    return names[n] ? `${n}(${names[n]})` : String(n)
  })
  return `[${annotated.join(',')}]`
}

// ─── 主组件 ──────────────────────────────────────

const App = () => {
  const { exit } = useApp()
  const [records, setRecords] = useState<KeyRecord[]>([])
  const [counter, setCounter] = useState(0)

  useInput((input: string, key: Key, event?: InputEvent) => {
    // q / Ctrl+C / Esc 退出（退出键本身也先记录一次，便于看其编码）
    const label = formatLabel(input, key)
    const seq = counter + 1
    const kp = event?.keypress
    const record: KeyRecord = {
      seq,
      label,
      input,
      flags: formatFlags(key),
      bytes: toBytes(kp?.sequence),
      raw: kp?.sequence ?? '',
    }
    setCounter(seq)
    setRecords((prev) => [record, ...prev].slice(0, 50))

    if (input === 'q' || (key.ctrl && input === 'c') || key.escape) {
      exit()
    }
    // c 清空历史（非 Ctrl+C 的裸 c）
    if (input === 'c' && !key.ctrl) {
      setRecords([])
      setCounter(0)
    }
  })

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="ansi:cyan">
        ══ 组合键捕获 ══
      </Text>
      <Text color="ansi:blackBright">
        按任意键捕获 · c 清空 · q/Esc/Ctrl+C 退出
      </Text>
      <Text color="ansi:blackBright">{'─'.repeat(60)}</Text>

      {/* 环境诊断：显示 smink 对当前终端的判定（诊断 Shift+Tab 等组合键的前提） */}
      <Box flexDirection="column" marginBottom={1}>
        <Text color="ansi:blackBright">
          {'终端判定   = '}
          <Text color={supportsExtendedKeys() ? 'ansi:green' : 'ansi:red'} bold>
            {env.terminal ?? '<null>'}
          </Text>
          {supportsExtendedKeys() ? (
            <Text color="ansi:green"> （已启用扩展按键协议）</Text>
          ) : (
            <Text color="ansi:red"> （未启用扩展按键协议 ← Shift+Tab 等组合键无法识别）</Text>
          )}
        </Text>
        <Text color="ansi:blackBright">
          {`MSYSTEM=${process.env.MSYSTEM ?? '<空>'}  WT_SESSION=${process.env.WT_SESSION ?? '<空>'}  TERM_PROGRAM=${process.env.TERM_PROGRAM ?? '<空>'}`}
        </Text>
      </Box>
      <Text color="ansi:blackBright">{'─'.repeat(60)}</Text>

      <ScrollBox flexGrow={1} maxHeight={20}>
        <Box flexDirection="column">
          {records.length === 0 ? (
            <Text color="ansi:blackBright" italic>
              （等待按键...）
            </Text>
          ) : (
            records.map((r) => (
              <Box key={r.seq} flexDirection="column" marginBottom={1}>
                <Box>
                  <Text color="ansi:yellow">#{r.seq.toString().padStart(3, ' ')} </Text>
                  <Text bold color="ansi:green">
                    {r.label}
                  </Text>
                </Box>
                <Text color="ansi:blackBright">
                  {'  input  = '}
                  <Text color="ansi:white">{JSON.stringify(r.input)}</Text>
                </Text>
                <Text color="ansi:blackBright">
                  {'  flags  = '}
                  <Text color="ansi:magenta">{r.flags}</Text>
                </Text>
                <Text color="ansi:blackBright">
                  {'  bytes  = '}
                  <Text color="ansi:cyan">{r.bytes}</Text>
                </Text>
              </Box>
            ))
          )}
        </Box>
      </ScrollBox>
    </Box>
  )
}

render(<App />)
