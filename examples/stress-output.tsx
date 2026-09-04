/**
 * 高频输出压力场景验证
 *
 * 背压门、DECSTBM、代际守卫、flush-tick 各有专项示例，但它们各自只验证
 * 一条路径。这里把管线放进一个真实场景里跑：以远高于帧率的频率持续提交，
 * 看渲染管线会不会出问题。
 *
 * 三类故障各有可观测特征：
 *
 *   - 丢帧堆积：提交已经停了，帧还在往外冒——排队的微任务 / 节流 trailing
 *     定时器没被代际守卫作废，或者排水定时器在空转。
 *   - 过期帧：某一帧画出比上一帧更老的状态。代际守卫失效时，被后续提交
 *     作废的微任务仍会执行并画出一帧过期布局。
 *   - 撕裂：同一帧里混着两个版本的内容。
 *
 * 判定"某一帧画的是哪个版本"用了一个小技巧：标记字符每 26 个版本循环
 * 一次，单看字符无法定序；但每帧都记下了"画出时已经提交了多少次"，
 * 于是真实版本就是"不超过该提交次数、且标记字符匹配的那个最大版本"。
 *
 * 运行：npx tsx examples/stress-output.tsx
 */

import { EventEmitter } from 'node:events'
import React from 'react'
import Ink from '../src/ink/ink.js'
import { Box, Text } from '../src/index.js'
import { FRAME_INTERVAL_MS } from '../src/ink/constants.js'
import type { FrameEvent } from '../src/ink/frame.js'
import { getTerminalFlushTick, resetTerminalFlushTick } from '../src/ink/flush-tick.js'

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

const ROWS = 8
const RUN = 6
// 分批提交：一批里的 8 次提交挤在同一个事件循环 tick 内（不给事件循环
// 喘息），批次之间才让出。同 tick 连续提交正是"冷启动"的形状——也是
// 代际守卫真正要挡的场景：节流 leading 排下的微任务还没跑，同一 tick
// 里又来了 7 次提交。
const BATCHES = 20
const COMMITS_PER_BATCH = 8
const BATCH_INTERVAL_MS = 2
const COMMITS = BATCHES * COMMITS_PER_BATCH

type Phases = NonNullable<FrameEvent['phases']>

/** 第 v 个版本的标记字符。每 26 个版本循环一次。 */
const mark = (v: number): string => String.fromCharCode(65 + (v % 26))
/** 一整行的标记文本。版本一变，整行的每个格子都会变。 */
const line = (v: number): string => mark(v).repeat(RUN)

const stripAnsi = (s: string): string =>
  s
    .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    .replace(/\x1b[()][0-9A-Za-z]/g, '')

/** 假 stdout：isTTY=true 才会走增量 diff 路径，撕裂才有意义。 */
class FakeStdout extends EventEmitter {
  columns = 60
  rows = 20
  isTTY = true
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

const App = ({ version }: { version: number }) => (
  <Box flexDirection="column">
    {Array.from({ length: ROWS }, (_, i) => (
      <Text key={i}>{line(version)}</Text>
    ))}
  </Box>
)

type Captured = {
  /** 这一帧写出的可见文本（已剥掉转义序列） */
  text: string
  /** 画出这一帧时，已经提交了多少次 */
  commitsAtPaint: number
  phases: Phases | undefined
}

async function main(): Promise<void> {
  const stdout = new FakeStdout()
  const stdin = new FakeStdin()
  const frames: Captured[] = []
  let commitCount = 0

  const ink = new Ink({
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    stderr: stdout as unknown as NodeJS.WriteStream,
    exitOnCtrlC: false,
    // 关掉 console 补丁：本例的断言输出要走真实的 process.stdout，
    // 否则 check() 的日志会被重定向下文要统计的假 stdout。
    patchConsole: false,
    onFrame: event => {
      // onFrame 在 onRender 末尾触发，此时这一帧的字节已经写完，
      // 累积下来的 writes 正好就是这一帧。
      const text = stripAnsi(stdout.writes.join(''))
      stdout.writes.length = 0
      frames.push({
        text,
        commitsAtPaint: commitCount,
        phases: event.phases,
      })
    },
  })

  resetTerminalFlushTick()
  ink.render(<App version={0} />)

  console.log('\n\x1b[1m[1] 高频提交下的节流\x1b[0m')

  // notifySelectionChange 走的是 renderNow（即时渲染）路径——选区变更、
  // pause/resume、forceRedraw、resize 都从这里进。它会推进代际并取消
  // 排队的微任务，把它插在同一 tick 的提交序列中间，正是代际守卫要挡的
  // 交错形状。
  const immediateRender = (
    ink as unknown as { notifySelectionChange(): void }
  ).notifySelectionChange.bind(ink)

  const start = Date.now()
  for (let b = 0; b < BATCHES; b++) {
    for (let i = 0; i < COMMITS_PER_BATCH; i++) {
      commitCount++
      ink.render(<App version={commitCount} />)
      if (i === COMMITS_PER_BATCH >> 1) immediateRender()
    }
    await sleep(BATCH_INTERVAL_MS)
  }
  const burstMs = Date.now() - start

  // 等节流 trailing 窗口 + 排队微任务全部落地。
  await sleep(120)
  const framesAtQuiescence = frames.length
  const elapsedMs = Date.now() - start

  console.log(
    `      ${COMMITS} 次提交 / ${burstMs}ms → ${framesAtQuiescence} 帧`,
  )
  check('帧数远少于提交数（节流生效）', framesAtQuiescence < COMMITS / 2, true)
  // 每批正常会出 2 帧：一次即时渲染 + 一次节流 leading（renderNow 会
  // cancel 掉节流，于是批内剩下的提交又拿到一次新的 leading）。上界按
  // "每批 2 帧 + 节流允许的时间片数"给，再加一点余量。
  //
  // 这个上界远小于 COMMITS（160）——如果代际守卫失效、排队的微任务不被
  // 作废，帧数会朝"每批 8 帧"涨，这里立刻就会红。
  const frameCeiling =
    BATCHES * 2 + Math.ceil(elapsedMs / FRAME_INTERVAL_MS) + 4
  console.log(`      帧数上界 ${frameCeiling}（完全不合并则是 ${COMMITS}）`)
  check('帧数远低于上界（合并生效，无堆积）', framesAtQuiescence <= frameCeiling, true)

  console.log('\n\x1b[1m[2] 收敛：提交停止后不再冒帧\x1b[0m')

  await sleep(200)
  check('提交停止后 200ms 内没有新帧（无丢帧堆积）', frames.length, framesAtQuiescence)

  console.log('\n\x1b[1m[3] 帧序列单调不减（无过期帧）\x1b[0m')

  // 标记字符每 26 个版本循环一次，所以真实版本 = 不超过 commitsAtPaint
  // 且标记字符匹配的那个最大版本。
  const versionOf = (letter: string, max: number): number => {
    for (let v = max; v >= 0 && v > max - 26; v--) {
      if (mark(v) === letter) return v
    }
    return -1
  }

  let regressions = 0
  let unmatched = 0
  let painted = 0
  let prevVersion = -1
  for (const frame of frames) {
    const runs = frame.text.match(/[A-Z]{2,}/g)
    if (!runs || runs.length === 0) continue // 空帧：这一帧没有任何变化
    painted++
    const version = versionOf(runs[0]![0]!, frame.commitsAtPaint)
    if (version < 0) {
      unmatched++
      continue
    }
    if (version < prevVersion) regressions++
    prevVersion = version
  }

  console.log(`      ${frames.length} 帧中有 ${painted} 帧真正写出了内容`)
  check('每一帧都能定位到具体版本', unmatched, 0)
  check('没有帧画出比前一帧更老的状态', regressions, 0)

  console.log('\n\x1b[1m[4] 帧内无撕裂\x1b[0m')

  let torn = 0
  for (const frame of frames) {
    const runs = frame.text.match(/[A-Z]{2,}/g)
    if (!runs) continue
    if (new Set(runs.map(r => r[0])).size > 1) torn++
  }
  check('没有帧混着两个版本的内容', torn, 0)

  console.log('\n\x1b[1m[5] flush-tick 与写出帧数一致\x1b[0m')

  // 每帧写出后记一次 tick，onFrame 每帧触发一次——两者必须相等，
  // 多一个少一个都说明有帧被重复画或漏记。
  check('flush tick 增量等于帧数', getTerminalFlushTick(), frames.length)

  console.log('\n\x1b[1m[6] 帧遥测 phases 完整\x1b[0m')

  const lastPhase = frames[frames.length - 1]?.phases
  const phaseKeys: Array<keyof Phases> = [
    'renderer',
    'diff',
    'optimize',
    'write',
    'patches',
    'yoga',
    'commit',
    'yogaVisited',
    'yogaMeasured',
    'yogaCacheHits',
    'yogaLive',
  ]
  check(
    '末帧 phases 各字段均为有限数值',
    lastPhase !== undefined &&
      phaseKeys.every(k => Number.isFinite(lastPhase[k])),
    true,
  )

  console.log('\n\x1b[1m[7] 最终态正确\x1b[0m')

  const lastPainted = [...frames].reverse().find(f => f.text.length > 0)
  check(
    '最后一帧画出的是最终版本',
    lastPainted?.text.includes(line(commitCount)) ?? false,
    true,
  )

  ink.unmount()

  console.log(`\n\x1b[1m结果：\x1b[0m ${passed} 通过, ${failed} 失败\n`)
  process.exit(failed === 0 ? 0 : 1)
}

void main()
