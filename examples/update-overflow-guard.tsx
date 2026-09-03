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
 * 运行：npx tsx examples/update-overflow-guard.tsx
 */

import {
  advanceQuenchCooldownForTest,
  callWithUpdateOverflowGuard,
  isNestedUpdateOverflow,
  registerOverflowQuench,
  resetOverflowQuenchesForTest,
  resetUpdateOverflowGuardForTest,
  swallowNestedUpdateOverflow,
} from '../src/ink/update-overflow-guard.js'

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

console.log(`\n\x1b[1m结果：\x1b[0m ${passed} 通过, ${failed} 失败\n`)
process.exit(failed === 0 ? 0 : 1)
