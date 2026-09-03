/**
 * flush-tick 验证示例
 *
 * 验证"已提交(mounted)"与"已刷屏(painted)"的区分能力。渲染与写出解耦：
 * 一次 React 提交可能在真正写出字节前就被后续提交作废，把 mounted 当成
 * painted 的组件会丢内容（主屏 scrollback 不会保存被跳过的行）。
 *
 * 本例演示真实消费模式：提交时捕获 flush tick，只有 tick 前进（真的写出过
 * 一帧）之后才允许收起占位行。
 *
 * 运行：npx tsx examples/flush-tick.tsx
 */

import React, { useEffect, useState } from 'react'
import { render, Box, Text } from '../src/index.js'
import {
  getTerminalFlushTick,
  resetTerminalFlushTick,
  noteTerminalFlush,
} from '../src/ink/flush-tick.js'

let passed = 0
let failed = 0

function check(name: string, actual: unknown, expected: unknown): void {
  const ok = actual === expected
  if (ok) {
    passed++
    console.log(`  \x1b[32m✓\x1b[0m ${name}`)
  } else {
    failed++
    console.log(`  \x1b[31m✗\x1b[0m ${name}`)
    console.log(`      期望: ${JSON.stringify(expected)}`)
    console.log(`      实际: ${JSON.stringify(actual)}`)
  }
}

console.log('\n\x1b[1m[1] 计数器模块语义\x1b[0m')
resetTerminalFlushTick()
check('重置后为 0', getTerminalFlushTick(), 0)
noteTerminalFlush()
check('记录一次写出后为 1', getTerminalFlushTick(), 1)
noteTerminalFlush()
noteTerminalFlush()
check('记录三次写出后为 3', getTerminalFlushTick(), 3)
resetTerminalFlushTick()
check('再次重置归零', getTerminalFlushTick(), 0)

// 组件把观察到的状态写回这里，供退出后断言。
let framesObserved = 0
const observed: {
  committedTick: number | null
  painted: boolean
  polls: number
} = { committedTick: null, painted: false, polls: 0 }

const App = () => {
  // 提交时捕获 tick：此刻内容只进入了 React 树，尚未写出到终端。
  const [committedTick, setCommittedTick] = useState<number | null>(null)
  const [painted, setPainted] = useState(false)
  const [polls, setPolls] = useState(0)

  useEffect(() => {
    setCommittedTick(getTerminalFlushTick())
  }, [])

  // 消费模式：轮询 flush tick，只有真的写出过一帧才允许收起占位行。
  useEffect(() => {
    if (committedTick === null || painted) return
    const id = setInterval(() => {
      setPolls(p => p + 1)
      if (getTerminalFlushTick() > committedTick) setPainted(true)
    }, 8)
    return () => clearInterval(id)
  }, [committedTick, painted])

  observed.committedTick = committedTick
  observed.painted = painted
  observed.polls = polls

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="ansi:cyan">flush-tick 集成验证</Text>
      <Text>提交时捕获的 tick: {committedTick === null ? 'null' : String(committedTick)}</Text>
      <Text>当前 tick: {getTerminalFlushTick()}</Text>
      <Text>观察到的帧数 (onFrame): {framesObserved}</Text>
      <Text color={painted ? 'ansi:green' : 'ansi:yellow'}>
        {painted
          ? `已刷屏：占位行可安全收起（轮询 ${polls} 次）`
          : '尚未刷屏：占位行必须保留'}
      </Text>
    </Box>
  )
}

async function main(): Promise<void> {
  console.log('\n\x1b[1m[2] 真实渲染集成：提交 → 写出 → tick 前进\x1b[0m')

  const app = await render(<App />, {
    onFrame: () => {
      framesObserved++
    },
  })

  await new Promise(resolve => setTimeout(resolve, 1000))
  app.unmount()

  console.log(`  观察到的帧数: ${framesObserved}`)
  console.log(`  最终 tick: ${getTerminalFlushTick()}`)

  check('组件成功捕获到提交时的 tick', typeof observed.committedTick, 'number')
  check('渲染期间至少写出过一帧', framesObserved > 0, true)
  check(
    'flush tick 与写出帧数一致（每帧写出计一次）',
    getTerminalFlushTick(),
    framesObserved,
  )
  check(
    'tick 前进后组件判定为已刷屏',
    observed.painted,
    true,
  )
  check(
    '刷屏判定发生在 tick 严格大于提交值之后',
    observed.committedTick !== null && getTerminalFlushTick() > observed.committedTick,
    true,
  )

  console.log(`\n\x1b[1m结果：\x1b[0m ${passed} 通过, ${failed} 失败\n`)
  process.exit(failed === 0 ? 0 : 1)
}

void main()
