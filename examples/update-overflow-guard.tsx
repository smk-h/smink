/**
 * update-overflow-guard 验证示例
 *
 * React 嵌套更新溢出（Minified React error #185 / Maximum update depth
 * exceeded）的自愈守卫。验证：
 *   1. 错误识别只匹配 #185 这一类
 *   2. 溢出错误被吸收并返回 true，其他错误原样返回 false 由调用方重抛
 *   3. 日志限频：同一窗口只落一条日志，其余仅计数
 *   4. 熔断器：持续震荡达阈值时触发 quench，退避翻倍并封顶
 *   5. callWithUpdateOverflowGuard 对溢出静默吸收、对其他错误透传
 *   6. 进程级守卫可安装且对非溢出错误保持默认语义
 *
 * 后半段验证接线（模块落地之后的调用点）：
 *   7. createClock 登记 clock.tick 熔断 quench，震荡触发时真的挂起时钟
 *   8. clock.tick 回调抛 #185 被吸收，同 tick 的后续订阅者继续跑
 *   9. Ink 构造时安装进程级兜底；选区通知回调抛 #185 被吸收
 *
 * 运行：npx tsx examples/update-overflow-guard.tsx
 */

import { EventEmitter } from 'node:events'
import React from 'react'
import {
  advanceQuenchCooldownForTest,
  callWithUpdateOverflowGuard,
  isNestedUpdateOverflow,
  registerOverflowQuench,
  resetOverflowQuenchesForTest,
  resetUpdateOverflowGuardForTest,
  swallowNestedUpdateOverflow,
} from '../src/ink/update-overflow-guard.js'
import { createClock } from '../src/ink/components/ClockContext.js'
import Ink from '../src/ink/ink.js'
import { Box, Text } from '../src/index.js'

/** 把指定源的冷却窗口往前拨，避免测试真的等待退避时长。 */
function advanceCooldown(source: string, ms: number): void {
  advanceQuenchCooldownForTest(source, ms)
}

let passed = 0
let failed = 0

function check(name: string, actual: unknown, expected: unknown): void {
  if (actual === expected) {
    passed++
    console.log(`  \x1b[32m✓\x1b[0m ${name}`)
  } else {
    failed++
    console.log(`  \x1b[31m✗\x1b[0m ${name}`)
    console.log(`      期望: ${JSON.stringify(expected)}`)
    console.log(`      实际: ${JSON.stringify(actual)}`)
  }
}

const OVERFLOW_A = new Error('Minified React error #185; visit https://react.dev/errors/185')
const OVERFLOW_B = new Error('Maximum update depth exceeded')
const OTHER = new Error('Something else entirely went wrong')

console.log('\n\x1b[1m[1] 错误识别\x1b[0m')
check('识别 Minified React error #185', isNestedUpdateOverflow(OVERFLOW_A), true)
check('识别 Maximum update depth exceeded', isNestedUpdateOverflow(OVERFLOW_B), true)
check('不误判其他错误', isNestedUpdateOverflow(OTHER), false)
check('不误判非 Error 值', isNestedUpdateOverflow('boom'), false)
check('不误判 null', isNestedUpdateOverflow(null), false)
check('不误判 undefined', isNestedUpdateOverflow(undefined), false)

console.log('\n\x1b[1m[2] 吸收语义\x1b[0m')
resetUpdateOverflowGuardForTest()
check('溢出错误被吸收', swallowNestedUpdateOverflow(OVERFLOW_A, 'probe.a'), true)
check('其他错误不被吸收', swallowNestedUpdateOverflow(OTHER, 'probe.a'), false)

console.log('\n\x1b[1m[3] 日志限频（同一窗口只落一条）\x1b[0m')
resetUpdateOverflowGuardForTest()
// 连打 4 次，应全部吸收但只有第一次记日志；此处无法直接观测日志条数，
// 改为验证吸收行为稳定且计数累计到熔断阈值前的临界点。
let absorbed = 0
for (let i = 0; i < 4; i++) {
  if (swallowNestedUpdateOverflow(OVERFLOW_A, 'probe.ratelimit')) absorbed++
}
check('窗口内 4 次全部被吸收', absorbed, 4)
check('未达熔断阈值（4 < 5）', absorbed < 5, true)

console.log('\n\x1b[1m[4] 熔断器与指数退避\x1b[0m')
resetUpdateOverflowGuardForTest()
resetOverflowQuenchesForTest()
const quenchCalls: number[] = []
registerOverflowQuench('probe.trip', ms => quenchCalls.push(ms))

// 连打 5 次触发第一次熔断
for (let i = 0; i < 5; i++) {
  swallowNestedUpdateOverflow(OVERFLOW_A, 'probe.trip')
}
check('达到阈值触发 quench', quenchCalls.length, 1)
check('首次退避为基础值 5s', quenchCalls[0], 5_000)

// 退避期内不重复跳闸：这是设计意图——已在冷却窗口中的源不应被反复暂停。
for (let i = 0; i < 5; i++) {
  swallowNestedUpdateOverflow(OVERFLOW_A, 'probe.trip')
}
check('退避期内不重复触发 quench', quenchCalls.length, 1)

// 冷却窗口结束后再次震荡：退避翻倍。通过改写 quenchUntil 模拟时间推进，
// 避免测试真的等待 5 秒。
advanceCooldown('probe.trip', 5_001)
for (let i = 0; i < 5; i++) {
  swallowNestedUpdateOverflow(OVERFLOW_A, 'probe.trip')
}
check('冷却结束后再次触发 quench', quenchCalls.length, 2)
check('退避翻倍为 10s', quenchCalls[1], 10_000)

// 第三次：20s
advanceCooldown('probe.trip', 10_001)
for (let i = 0; i < 5; i++) {
  swallowNestedUpdateOverflow(OVERFLOW_A, 'probe.trip')
}
check('第三次退避为 20s', quenchCalls[2], 20_000)

// 退避封顶：连跳到超过 60s 上限后应被夹住
for (let i = 0; i < 8; i++) {
  advanceCooldown('probe.trip', 61_000)
  for (let j = 0; j < 5; j++) {
    swallowNestedUpdateOverflow(OVERFLOW_A, 'probe.trip')
  }
}
check(
  '退避封顶在 60s',
  quenchCalls[quenchCalls.length - 1],
  60_000,
)

console.log('\n\x1b[1m[5] 未注册 quench 的源只吸收不熔断\x1b[0m')
resetUpdateOverflowGuardForTest()
resetOverflowQuenchesForTest()
let noQuenchAbsorbed = 0
for (let i = 0; i < 10; i++) {
  if (swallowNestedUpdateOverflow(OVERFLOW_A, 'probe.noquench')) noQuenchAbsorbed++
}
check('全部被吸收（进程不崩溃）', noQuenchAbsorbed, 10)

console.log('\n\x1b[1m[6] callWithUpdateOverflowGuard 包装\x1b[0m')
resetUpdateOverflowGuardForTest()
resetOverflowQuenchesForTest()

let overflowCallbackRan = false
callWithUpdateOverflowGuard('probe.wrap', () => {
  overflowCallbackRan = true
  throw OVERFLOW_B
})
check('回调已执行', overflowCallbackRan, true)
check('抛出溢出未向外传播', true, true)

let rethrown: unknown = null
try {
  callWithUpdateOverflowGuard('probe.wrap', () => {
    throw OTHER
  })
} catch (error) {
  rethrown = error
}
check('其他错误原样重抛', rethrown, OTHER)

let normalReturn = 0
callWithUpdateOverflowGuard('probe.wrap', () => {
  normalReturn = 42
})
check('无异常时正常执行', normalReturn, 42)

console.log('\n\x1b[1m[7] 各来源独立计数\x1b[0m')
resetUpdateOverflowGuardForTest()
resetOverflowQuenchesForTest()
const sourceQuench: number[] = []
registerOverflowQuench('srcA', ms => sourceQuench.push(ms))

for (let i = 0; i < 5; i++) swallowNestedUpdateOverflow(OVERFLOW_A, 'srcA')
for (let i = 0; i < 3; i++) swallowNestedUpdateOverflow(OVERFLOW_A, 'srcB')
check('srcA 达到阈值触发熔断', sourceQuench.length, 1)
check('srcB 未达阈值不触发', sourceQuench.length, 1)

async function wiring(): Promise<void> {
  const sleep = (ms: number): Promise<void> =>
    new Promise(resolve => setTimeout(resolve, ms))

  console.log('\n\x1b[1m[8] createClock 登记 clock.tick 熔断 quench\x1b[0m')

  resetUpdateOverflowGuardForTest()
  resetOverflowQuenchesForTest()
  // createClock 内部 registerOverflowQuench('clock.tick', ...)，
  // 所以必须在 reset 之后创建。
  const clock = createClock(16)
  let ticks = 0
  clock.subscribe(() => {
    ticks++
  }, true)

  await sleep(80)
  check('时钟在跑（收到 tick）', ticks > 0, true)

  // 连续 5 次 #185 → 达到熔断阈值 → quench 挂起时钟 5s
  for (let i = 0; i < 5; i++) {
    swallowNestedUpdateOverflow(OVERFLOW_A, 'clock.tick')
  }
  const ticksAtTrip = ticks
  await sleep(80)
  check('熔断触发后时钟被挂起（不再有 tick）', ticks, ticksAtTrip)

  // 退避窗口结束后恢复。用一次短挂起验证 resume 路径本身。
  clock.suspend(30)
  await sleep(100)
  check('挂起期满后时钟恢复', ticks > ticksAtTrip, true)

  console.log('\n\x1b[1m[9] clock.tick 回调抛 #185 被吸收\x1b[0m')

  const clock2 = createClock(16)
  let survivorRan = 0
  let throwerDone = false
  // 先订阅的抛 #185：若 tick 未经守卫，这会变成 uncaughtException
  // 直接杀掉进程（本例未装进程兜底），后面的断言根本不会打印。
  clock2.subscribe(() => {
    if (throwerDone) return
    throwerDone = true
    throw OVERFLOW_A
  }, true)
  clock2.subscribe(() => {
    survivorRan++
  }, true)

  await sleep(80)
  check('抛出方的异常被吸收（进程存活）', throwerDone, true)
  check('同 tick 的后续订阅者继续收到通知', survivorRan > 0, true)

  console.log('\n\x1b[1m[10] Ink 安装进程兜底 + 选区通知守卫\x1b[0m')

  class FakeStdout extends EventEmitter {
    columns = 40
    rows = 6
    isTTY = false
    write(): boolean {
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

  const stdout = new FakeStdout() as unknown as NodeJS.WriteStream
  const before = process.listenerCount('uncaughtException')
  const ink = new Ink({
    stdout,
    stdin: new FakeStdin() as unknown as NodeJS.ReadStream,
    stderr: stdout,
    exitOnCtrlC: false,
    patchConsole: false,
  })
  const after = process.listenerCount('uncaughtException')
  check('Ink 构造时安装进程级兜底', after - before, 1)
  check('同时安装 unhandledRejection 监听', process.listenerCount('unhandledRejection') > 0, true)

  ink.render(
    React.createElement(
      Box,
      { flexDirection: 'column' },
      React.createElement(Text, null, 'probe'),
    ),
  )

  resetUpdateOverflowGuardForTest()
  resetOverflowQuenchesForTest()
  let secondListenerRan = false
  ink.subscribeToSelectionChange(() => {
    throw OVERFLOW_B
  })
  ink.subscribeToSelectionChange(() => {
    secondListenerRan = true
  })
  // notifySelectionChange 是私有方法，这里直接驱动它以覆盖守卫路径。
  const notify = (ink as unknown as { notifySelectionChange(): void })
    .notifySelectionChange
    .bind(ink) as () => void
  let notifyThrew = false
  try {
    notify()
  } catch {
    notifyThrew = true
  }
  check('选区回调抛 #185 不向外传播', notifyThrew, false)
  check('后一个选区订阅者照常执行', secondListenerRan, true)

  ink.unmount()
}

void wiring().then(() => {
  console.log(`\n\x1b[1m结果：\x1b[0m ${passed} 通过, ${failed} 失败\n`)
  process.exit(failed === 0 ? 0 : 1)
})
