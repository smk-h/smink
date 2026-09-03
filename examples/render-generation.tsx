/**
 * renderGeneration 代际守卫验证示例
 *
 * 渲染是节流的：reconciler 提交后走 scheduleRender（lodash throttle，
 * leading + trailing），leading 那一侧把真正的绘制塞进 queueMicrotask，
 * 让 onRender 在 layout effects 提交之后才跑。
 *
 * 问题：leading 排下的微任务被后续提交作废之后，它仍会执行并画出一帧
 * 过期布局。即时渲染（pause/resume/forceRedraw/选区变更/卸载/resize）
 * 会先于微任务落地，此时微任务画的那一帧就是多余的——轻则浪费一帧，
 * 重则在 alt-screen 的 DECSTBM + blit 快路径上写出错误补丁。
 *
 * 方案：每个微任务携带创建它的代际号（renderGeneration）；即时渲染
 * （renderNow）推进代际并清空 pending，过期微任务在自己的守卫处原样返回。
 *
 * 本例用假 stdout（isTTY=false）把每帧的写出发出来做断言：非 TTY 模式下
 * log-update 走 renderFullFrame，一次写出就是一整帧。
 *
 * 运行：npx tsx examples/render-generation.tsx
 */

import { EventEmitter } from 'node:events'
import React from 'react'
import { renderSync, Box, Text } from '../src/index.js'
import instances from '../src/ink/instances.js'

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

/** 记录每次写出的假 stdout。isTTY=false → 每帧一次整屏写出。 */
class FakeStdout extends EventEmitter {
  columns = 40
  rows = 6
  isTTY = false
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

const stripAnsi = (s: string): string =>
  s
    .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    .replace(/\x1b[()][0-9A-Za-z]/g, '')

const App = ({ label }: { label: string }) => (
  <Box flexDirection="column">
    <Text>{label}</Text>
  </Box>
)

/** 让排队的微任务全部跑完。 */
const flushMicrotasks = (): Promise<void> => Promise.resolve()

async function main(): Promise<void> {
  const stdout = new FakeStdout()
  const stdin = new FakeStdin()

  console.log('\n\x1b[1m[1] 即时渲染作废排队中的微任务\x1b[0m')

  // renderSync 是同步的：提交 → throttle leading → queueMicrotask(M)。
  // 此刻 M 还没跑（微任务要等当前 task 结束）。
  const app = renderSync(<App label="mounted" />, {
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    // 关掉 console 补丁：本例的断言输出要走真实的 process.stdout，
    // 否则 check() 的日志会被重定向下文要统计的假 stdout。
    patchConsole: false,
  })

  const ink = instances.get(stdout as unknown as NodeJS.WriteStream) as unknown as {
    notifySelectionChange(): void
  }

  // 即时渲染（renderNow 路径）：推进代际，M 作废。
  ink.notifySelectionChange()
  await flushMicrotasks()

  check('挂载 + 即时渲染只写出一帧（过期微任务被丢弃）', stdout.writes.length, 1)
  check('写出的内容是当前状态', stripAnsi(stdout.writes[0] ?? '').includes('mounted'), true)

  console.log('\n\x1b[1m[2] 同一 tick 内连续两次 rerender 只画最终态\x1b[0m')

  app.rerender(<App label="second" />)
  app.rerender(<App label="third" />)
  await flushMicrotasks()

  // throttle 的 leading 边已经在这一 tick 用掉，第二次 rerender 落在
  // trailing（16ms 后的定时器）上，所以此刻只多出一帧，且是最终态。
  const writesAfterRerenders = stdout.writes.length
  check('连续两次 rerender 只多写出一帧', writesAfterRerenders, 2)
  check(
    '写出的是最终值 third',
    stripAnsi(stdout.writes[writesAfterRerenders - 1] ?? '').includes('third'),
    true,
  )
  check(
    '中间值 second 从未被写出',
    stripAnsi(stdout.writes.join('')).includes('second'),
    false,
  )

  console.log('\n\x1b[1m[3] 卸载后不再补画过期帧\x1b[0m')

  app.unmount()
  await flushMicrotasks()
  const writesAtUnmount = stdout.writes.length
  // 等过 throttle 的 trailing 窗口（16ms）与排水定时器，
  // 确认没有任何被作废的微任务在卸载之后又画出一帧。
  await new Promise(resolve => setTimeout(resolve, 100))
  check('卸载后不再有任何帧写出', stdout.writes.length, writesAtUnmount)

  console.log(`\n\x1b[1m结果：\x1b[0m ${passed} 通过, ${failed} 失败\n`)
  process.exit(failed === 0 ? 0 : 1)
}

void main()
