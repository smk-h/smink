/**
 * timeline-rail 验证示例
 *
 * 回合导航栏的纯几何模型：2 列宽的 gutter 取代传统滚动条，每个用户回合
 * 一个刻度，刻度位置编码会话顺序而非滚动比例。渲染器与鼠标命中测试共用
 * 同一份冻结结构，因此"看得到但点不中"在构造上不可能发生。
 *
 * 验证：
 *   1. 资格判定（宽度/回合数/视口/可滚动性）
 *   2. 几何计算与窗口滑动（回合数超出刻度行时围绕 active 滑动，
 *      底部优先尾部但绝不排除 active）
 *   3. 核心不变量：渲染出的每一行都能被命中，且命中的目标与渲染一致
 *   4. 预览截断的 CJK 与代理对安全性
 *   5. 真实渲染集成：组件内计算几何并自校验命中一致性
 *
 * 运行：npx tsx examples/timeline-rail.tsx
 */

import React, { useEffect, useMemo, useState } from 'react'
import { render, Box, Text, useApp } from '../src/index.js'
import {
  RAIL_MIN_TERMINAL_WIDTH,
  RAIL_MIN_TURNS,
  RAIL_WIDTH,
  clipPreview,
  computeRailGeometry,
  railEligible,
  railHit,
  wrapPreviewLines,
  type TimelineTurn,
} from '../src/ink/timeline-rail.js'
import { stringWidth } from '../src/ink/stringWidth.js'

let passed = 0
let failed = 0

const output: string[] = []

function log(msg: string): void {
  output.push(msg)
}

function flush(): void {
  process.stderr.write(`${output.join('\n')}\n`)
}

function check(name: string, actual: unknown, expected: unknown): void {
  if (actual === expected) {
    passed++
    log(`  \x1b[32m✓\x1b[0m ${name}`)
  } else {
    failed++
    log(`  \x1b[31m✗\x1b[0m ${name}`)
    log(`      期望: ${JSON.stringify(expected)}`)
    log(`      实际: ${JSON.stringify(actual)}`)
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** 构造 n 个回合，prompt top 按 contentGap 递增。 */
function makeTurns(n: number, contentGap = 10): TimelineTurn[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    top: i * contentGap,
    preview: `第 ${i + 1} 个回合的提示词`,
  }))
}

log('\n\x1b[1m[1] 资格判定\x1b[0m')
check(
  '窄终端不显示',
  railEligible({ turnCount: 5, terminalWidth: RAIL_MIN_TERMINAL_WIDTH - 1, viewportRows: 10, scrollable: true }),
  false,
)
check(
  '回合数不足不显示',
  railEligible({ turnCount: RAIL_MIN_TURNS - 1, terminalWidth: 80, viewportRows: 10, scrollable: true }),
  false,
)
check(
  '内容不可滚动时不显示',
  railEligible({ turnCount: 5, terminalWidth: 80, viewportRows: 10, scrollable: false }),
  false,
)
check(
  '视口过矮不显示',
  railEligible({ turnCount: 5, terminalWidth: 80, viewportRows: 2, scrollable: true }),
  false,
)
check(
  '条件齐备时显示',
  railEligible({ turnCount: 5, terminalWidth: 80, viewportRows: 10, scrollable: true }),
  true,
)
check('导航栏宽度常量为 2 列', RAIL_WIDTH, 2)

log('\n\x1b[1m[2] 几何计算\x1b[0m')
{
  const g = computeRailGeometry(4, 10, 1, false)
  check('回合数足够时返回几何', g !== null, true)
  // 4 个刻度 + 2 个箭头 = 6 行，居中于 10 行视口 → blockTop = (10-6)/2 = 2
  check('上行箭头居中起始行', g?.upRow, 2)
  check('首个刻度紧随箭头', g?.tickTop, 3)
  check('下行箭头在刻度之后', g?.downRow, 3 + 4)
  check('窗口覆盖全部回合', `${g?.windowStart}-${g?.windowEnd}`, '0-4')
}
{
  // 回合数超出刻度行：滑动窗口
  const g = computeRailGeometry(20, 10, 10, false)
  check('超量回合返回几何', g !== null, true)
  const shown = (g?.windowEnd ?? 0) - (g?.windowStart ?? 0)
  // 刻度容量 = 视口行数 - 2 个箭头 = 10 - 2 = 8
  check('可见刻度数不超过视口容量', shown, 8)
  check(
    'active 回合始终在窗口内（否则无刻度会高亮）',
    g !== null && 10 >= g.windowStart && 10 < g.windowEnd,
    true,
  )
}
{
  const g = computeRailGeometry(20, 10, 19, true)
  check(
    '底部时窗口偏向尾部',
    g?.windowEnd,
    20,
  )
  check(
    '底部时 active 仍在窗口内',
    g !== null && 19 >= g.windowStart && 19 < g.windowEnd,
    true,
  )
}
check('回合数不足返回 null', computeRailGeometry(1, 10, 0, false), null)
check('视口放不下任何刻度返回 null', computeRailGeometry(5, 2, 0, false), null)

log('\n\x1b[1m[3] 核心不变量：看得到必可点，点得到必一致\x1b[0m')
{
  // 遍历多种参数组合，逐行验证"渲染行 ↔ 命中目标"严格对应
  let violations = 0
  let checkedCombos = 0
  for (const turnCount of [2, 3, 5, 9, 20, 50]) {
    for (const viewportRows of [3, 5, 10, 24, 40]) {
      for (const activeIndex of [0, 1, Math.floor(turnCount / 2), turnCount - 1]) {
        if (activeIndex >= turnCount) continue
        for (const atBottom of [false, true]) {
          const g = computeRailGeometry(turnCount, viewportRows, activeIndex, atBottom)
          if (g === null) continue
          checkedCombos++

          // 收集所有"渲染出来"的行及其渲染内容
          const rendered = new Map<number, { kind: string; index: number }>()
          rendered.set(g.upRow, { kind: 'up', index: -1 })
          rendered.set(g.downRow, { kind: 'down', index: -1 })
          for (let i = g.windowStart; i < g.windowEnd; i++) {
            rendered.set(g.tickTop + (i - g.windowStart), { kind: 'tick', index: i })
          }

          // 每一行都要能被命中，且命中结果与渲染一致
          for (const [row, expected] of rendered) {
            const hit = railHit(g, row)
            if (hit === null) {
              violations++
              continue
            }
            const hitIndex = hit.kind === 'tick' ? hit.index : -1
            if (hit.kind !== expected.kind || hitIndex !== expected.index) {
              violations++
            }
          }

          // 反向：命中的行必然是渲染过的行，且刻度索引在窗口内
          for (let row = 0; row < viewportRows; row++) {
            const hit = railHit(g, row)
            if (hit === null) continue
            if (!rendered.has(row)) violations++
            if (hit.kind === 'tick') {
              if (hit.index < g.windowStart || hit.index >= g.windowEnd) violations++
              if (hit.index < 0 || hit.index >= turnCount) violations++
            }
          }

          // 结构自洽：箭头与刻度块不重叠且顺序正确
          if (!(g.upRow < g.tickTop && g.tickTop <= g.downRow)) violations++
          if (g.windowEnd - g.windowStart > viewportRows - 2) violations++
          if (g.downRow >= viewportRows) violations++
        }
      }
    }
  }
  check(`遍历 ${checkedCombos} 种参数组合，无渲染/命中不一致`, violations, 0)
  check('确实遍历了足够多的组合', checkedCombos > 100, true)
}

log('\n\x1b[1m[4] 预览截断\x1b[0m')
check('取首个非空行', clipPreview('\n\n  实际内容\n第二行', 50), '实际内容')
check('短文本原样返回', clipPreview('你好世界', 50), '你好世界')
check('空文本返回空串', clipPreview('', 50), '')
check('全空白返回空串', clipPreview('   \n\t\n  ', 50), '')

{
  const capped = clipPreview('a'.repeat(200), 10)
  check('按字符上限截断', capped.length, 10)
  check('以省略号结尾', capped.endsWith('…'), true)
}
{
  // 代理对安全：emoji 密集文本截断后不得出现孤代理
  const emojiText = '🎉'.repeat(100)
  const capped = clipPreview(emojiText, 5)
  check('emoji 截断不产生孤代理', /\p{Surrogate}/u.test(capped), false)
}
{
  // 按显示宽度换行（CJK 占 2 列）
  const lines = wrapPreviewLines('中文文本需要按显示宽度换行处理', 10)
  check('换行结果不超过 2 行', lines.length <= 2, true)
  check('每行显示宽度不超限', lines.every(l => stringWidth(l) <= 10), true)
}
{
  const lines = wrapPreviewLines('a'.repeat(100), 8)
  check('超长单行被截为 2 行', lines.length, 2)
  check('第二行以省略号结尾', lines[1]?.endsWith('…'), true)
  check('换行后每行宽度不超限', lines.every(l => stringWidth(l) <= 8), true)
}

// ---------------------------------------------------------------------------
// [5] 真实渲染集成
// ---------------------------------------------------------------------------

/** 对给定几何做一次"渲染行 ↔ 命中目标"自校验，返回校验报告。 */
function verifyGeometry(turnCount: number, rows: number): string {
  const g = computeRailGeometry(turnCount, rows, 3, false)
  if (g === null) return 'no-geometry'
  const rendered = new Map<number, string>()
  rendered.set(g.upRow, 'up')
  rendered.set(g.downRow, 'down')
  for (let i = g.windowStart; i < g.windowEnd; i++) {
    rendered.set(g.tickTop + (i - g.windowStart), `tick:${i}`)
  }
  let bad = 0
  for (const [row, want] of rendered) {
    const h = railHit(g, row)
    const got = h === null ? 'null' : h.kind === 'tick' ? `tick:${h.index}` : h.kind
    if (got !== want) bad++
  }
  return bad === 0 ? `ok(${rendered.size} 行全部可命中)` : `MISMATCH(${bad})`
}

let lastReport = '未运行'

function RailProbe() {
  const { exit } = useApp()
  const [rows, setRows] = useState(20)
  const [turnCount, setTurnCount] = useState(12)

  const report = useMemo(() => verifyGeometry(turnCount, rows), [rows, turnCount])
  lastReport = report

  useEffect(() => {
    // 中途改变参数，验证不同配置下渲染中仍自洽
    const id = setTimeout(() => {
      setRows(8)
      setTurnCount(30)
    }, 150)
    const done = setTimeout(() => exit(), 700)
    return () => {
      clearTimeout(id)
      clearTimeout(done)
    }
  }, [exit])

  const color =
    report === 'no-geometry'
      ? 'ansi:yellow'
      : report.startsWith('ok')
        ? 'ansi:green'
        : 'ansi:red'

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="ansi:cyan">timeline-rail 验证（渲染集成）</Text>
      <Text>
        视口 {rows} 行 / {turnCount} 个回合
      </Text>
      <Text color={color}>命中一致性: {report}</Text>
    </Box>
  )
}

async function main(): Promise<void> {
  log('\n\x1b[1m[5] 真实渲染集成：组件内自校验\x1b[0m')
  const app = await render(<RailProbe />)
  await sleep(900)
  app.unmount()
  check('组件渲染与卸载正常', app !== null, true)
  check('渲染期间几何自校验通过', lastReport.startsWith('ok'), true)

  log(`\n\x1b[1m结果：\x1b[0m ${passed} 通过, ${failed} 失败\n`)
  flush()
  process.exit(failed === 0 ? 0 : 1)
}

void main()
