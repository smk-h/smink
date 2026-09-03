/**
 * 背压门（PTY 积压保护）验证示例
 *
 * ScrollBox 滚动时，每帧只消化一部分待滚动量（proportional/adaptive drain），
 * 余量靠 scheduleDrain() 以四分之一帧间隔（~250fps）连续补帧追平。
 *
 * 问题：终端链路慢的时候（Windows ConPTY 往返、ssh 高延迟），stdout 里
 * 还没冲出去的字节会越积越多，而排水帧仍在按 250fps 排队。每多排一帧，
 * 就往"输入 → 上屏"的延迟里再加一整帧的 render+write，滚动读起来发黏。
 *
 * 方案：排水帧写入前先看 stdout 的积压（writableLength）。超过
 * PTY_BACKLOG_BYTES 就这一帧不排，改为按同样间隔复探，等积压消退再排。
 * 闸门只拦排水帧——React 驱动的渲染（按键、流式输出）仍走正常节流，
 * 用户可见的更新绝不能排在滚动输出后面。
 *
 * 本例用可控 writableLength 的假 stdout 直接驱动 scheduleDrain()，
 * 断言闸门在积压期拦住补帧、积压消退后恢复。
 *
 * 运行：npx tsx examples/backpressure.tsx
 */

import { EventEmitter } from 'node:events'
import React from 'react'
import Ink from '../src/ink/ink.js'
import { Box, Text } from '../src/index.js'
import { PTY_BACKLOG_BYTES } from '../src/ink/constants.js'

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

/** 假 stdout：writableLength 可在用例中切换，用于模拟 pty 积压。 */
class FakeStdout extends EventEmitter {
  columns = 40
  rows = 6
  isTTY = false
  writableLength = 0
  readonly writes: string[] = []

  write(chunk: string): boolean {
    this.writes.push(chunk)
    return true
  }
}

class FakeStdin extends EventEmitter {
  isTTY = false
  isRaw = false

  read(): null {
    return null
  }
  resume(): this {
    return this
  }
  pause(): this {
    return this
  }
  ref(): this {
    return this
  }
  unref(): this {
    return this
  }
  setRawMode(): this {
    return this
  }
}

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms))

const App = () => (
  <Box flexDirection="column">
    <Text>backpressure</Text>
  </Box>
)

async function main(): Promise<void> {
  const stdout = new FakeStdout()
  const stdin = new FakeStdin()
  const stream = stdout as unknown as NodeJS.WriteStream

  const ink = new Ink({
    stdout: stream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    stderr: stream,
    exitOnCtrlC: false,
    patchConsole: false,
  })
  ink.render(<App />)

  // scheduleDrain 是私有的（只在 onRender 检测到滚动余量时调用），
  // 这里直接驱动它以精确控制积压条件。
  const drain = (ink as unknown as { scheduleDrain(): void }).scheduleDrain
    .bind(ink) as () => void

  console.log('\n\x1b[1m[1] 无积压时排水帧正常排下\x1b[0m')

  stdout.writableLength = 0
  const before = stdout.writes.length
  drain()
  await sleep(60)
  check('积压为 0 时补帧已写出', stdout.writes.length > before, true)

  console.log('\n\x1b[1m[2] 阈值以下不触发闸门\x1b[0m')

  const beforeUnder = stdout.writes.length
  stdout.writableLength = PTY_BACKLOG_BYTES
  drain()
  await sleep(60)
  check(
    '积压恰好等于阈值时仍正常补帧',
    stdout.writes.length > beforeUnder,
    true,
  )

  console.log('\n\x1b[1m[3] 超阈值时拦住补帧并复探\x1b[0m')

  const beforeOver = stdout.writes.length
  // 制造一次真积压：直接往 stdout 塞一大块字节。
  stdout.writableLength = PTY_BACKLOG_BYTES + 1024
  drain()
  // 远长于排水间隔：闸门若失效，这段时间内会连排多帧。
  await sleep(80)
  check('积压超阈值期间不写出任何帧', stdout.writes.length, beforeOver)

  console.log('\n\x1b[1m[4] 积压消退后恢复补帧\x1b[0m')

  stdout.writableLength = 0
  // 复探定时器还活着，等它下一次探测即可，无需再调 scheduleDrain。
  await sleep(80)
  check('积压消退后补帧恢复', stdout.writes.length > beforeOver, true)

  ink.unmount()

  console.log(`\n\x1b[1m结果：\x1b[0m ${passed} 通过, ${failed} 失败\n`)
  process.exit(failed === 0 ? 0 : 1)
}

void main()
