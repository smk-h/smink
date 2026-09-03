/**
 * geometry-trace 验证示例
 *
 * 每帧滚动几何取证：设置 SMINK_GEOMETRY_TRACE=<file> 后，每绘制一帧追加
 * 一行 JSONL，含帧编号、触发成因、耗时，以及每个 ScrollBox 的解析几何
 * （follow/drain/clamp 各阶段的 scrollTop、sticky/atBottom/grew 标志、
 * scrollHeight 与 maxScroll 的 prev/cur、虚拟滚动 clamp 边界）。
 *
 * 未设置环境变量时全部入口走单分支早退，零开销。
 *
 * 验证：
 *   1. 未启用时的零开销早退（各入口不产生副作用）
 *   2. 启用后模块层能正确组装并落盘一行 JSONL（帧号/成因/ScrollBox 几何）
 *   3. 真实渲染集成：带 ScrollBox 的 App 滚动后，取证文件里出现含滚动
 *      几何的记录，且帧号递增、成因被正确标注
 *
 * 运行：npx tsx examples/geometry-trace.tsx
 */

import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  GEOMETRY_TRACE_ENABLED,
  beginGeometryFrame,
  endGeometryFrame,
  noteFrameCause,
  noteScrollGeometry,
  noteAuxNumber,
  resetGeometryTraceForTest,
  type ScrollGeometryNote,
} from '../src/ink/geometry-trace.js'

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

const SAMPLE: ScrollGeometryNote = {
  sticky: true,
  shrunk: false,
  grew: true,
  atBottom: true,
  scrollTopBeforeFollow: 10,
  cur: 12,
  scrollTop: 11,
  renderScrollTop: 11,
  scrollHeight: 100,
  prevScrollHeight: 95,
  innerHeight: 20,
  maxScroll: 80,
  prevMaxScroll: 75,
  clampMin: 0,
  clampMax: 80,
}

log('\n\x1b[1m[1] 未启用时的零开销早退\x1b[0m')
check('当前进程未设置环境变量时模块判定为关闭', GEOMETRY_TRACE_ENABLED, false)
// 关闭态下所有入口都是 no-op（不会抛错、不会写文件、不累积状态）
let noopThrew = false
try {
  noteFrameCause('scroll')
  noteScrollGeometry(SAMPLE)
  noteAuxNumber('rows', 3)
  beginGeometryFrame(1)
  endGeometryFrame(1.5)
} catch {
  noopThrew = true
}
check('关闭态下所有入口均为 no-op 且不抛错', noopThrew, false)

// ---------------------------------------------------------------------------
// [2] 模块层：启用后的组装与落盘
// ---------------------------------------------------------------------------
// 子进程内设置环境变量，验证真实的启用路径（模块常量在导入时求值）。
log('\n\x1b[1m[2] 启用后的组装与落盘（子进程）\x1b[0m')

const dir = mkdtempSync(join(tmpdir(), 'smink-geom-'))
const traceFile = join(dir, 'trace.jsonl')
rmSync(traceFile, { force: true })

const script = `
import { beginGeometryFrame, endGeometryFrame, noteFrameCause, noteScrollGeometry, noteAuxNumber } from './src/ink/geometry-trace.js'
noteFrameCause('scroll')
noteFrameCause('resize')          // 首个成因胜出，这条应被忽略
noteScrollGeometry(${JSON.stringify(SAMPLE)})
noteAuxNumber('rows', 3)
beginGeometryFrame(7)
endGeometryFrame(1.25)
`

const result = spawnSync(
  process.execPath,
  ['--import', 'tsx', '--input-type=module', '-e', script],
  {
    cwd: process.cwd(),
    env: { ...process.env, SMINK_GEOMETRY_TRACE: traceFile },
    encoding: 'utf8',
  },
)

if (result.error !== undefined || result.status !== 0) {
  log(`  \x1b[31m!\x1b[0m 子进程执行失败: ${String(result.error ?? result.stderr)}`)
}

let lines: string[] = []
try {
  lines = readFileSync(traceFile, 'utf8').split('\n').filter(Boolean)
} catch {
  lines = []
}

check('落盘了一行 JSONL', lines.length, 1)

if (lines.length === 1) {
  const rec = JSON.parse(lines[0]!) as {
    frame: number
    cause: string
    ms: number
    scroll: ScrollGeometryNote[]
    aux: Record<string, number>
  }
  check('帧号为 beginGeometryFrame 传入值', rec.frame, 7)
  check('成因取首个标注（scroll 胜出）', rec.cause, 'scroll')
  check('耗时被四舍五入到 0.1ms', rec.ms, 1.3)
  check('记录了 1 个 ScrollBox 几何', rec.scroll.length, 1)
  check('几何字段完整保留', rec.scroll[0]?.maxScroll, 80)
  check('保留了 follow 前的 scrollTop', rec.scroll[0]?.scrollTopBeforeFollow, 10)
  check('保留了渲染用的 clamp 后 scrollTop', rec.scroll[0]?.renderScrollTop, 11)
  check('辅助计数被记录', rec.aux.rows, 3)
  check('带有 ISO 时间戳', typeof (rec as { t?: string }).t, 'string')
}

// ---------------------------------------------------------------------------
// [3] 真实渲染集成：ScrollBox 滚动产出取证
// ---------------------------------------------------------------------------

const traceFile2 = join(dir, 'trace-render.jsonl')
rmSync(traceFile2, { force: true })

log('\n\x1b[1m[3] 真实渲染集成（子进程带环境变量）\x1b[0m')

const renderScript = `
import React, { useEffect, useRef, useState } from 'react'
import { render, Box, Text, ScrollBox, useApp } from './src/index.js'

function ScrollApp() {
  const { exit } = useApp()
  const ref = useRef(null)
  useEffect(() => {
    const id = setTimeout(() => { ref.current?.scrollBy(6) }, 150)
    const done = setTimeout(() => exit(), 900)
    return () => { clearTimeout(id); clearTimeout(done) }
  }, [exit])
  return React.createElement(Box, { flexDirection: 'column', padding: 1 },
    React.createElement(Text, null, 'geometry-trace render probe'),
    React.createElement(ScrollBox, { ref, height: 6, width: 40 },
      React.createElement(Box, { flexDirection: 'column' },
        Array.from({ length: 30 }, (_, i) =>
          React.createElement(Text, { key: i }, 'row ' + i)))))
}

async function main() {
  const app = await render(React.createElement(ScrollApp))
  await new Promise(r => setTimeout(r, 1000))
  app.unmount()
  process.exit(0)
}
void main()
`

const result2 = spawnSync(
  process.execPath,
  ['--import', 'tsx', '--input-type=module', '-e', renderScript],
  {
    cwd: process.cwd(),
    env: { ...process.env, SMINK_GEOMETRY_TRACE: traceFile2 },
    encoding: 'utf8',
  },
)

if (result2.error !== undefined || result2.status !== 0) {
  log(`  \x1b[31m!\x1b[0m 渲染子进程失败: ${String(result2.error ?? result2.stderr)}`)
}

let recs: {
  frame: number
  cause: string
  ms: number
  scroll: ScrollGeometryNote[]
}[] = []
try {
  recs = readFileSync(traceFile2, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(l => JSON.parse(l) as (typeof recs)[number])
} catch {
  recs = []
}

check('渲染期间产出了多帧取证记录', recs.length > 1, true)

if (recs.length > 1) {
  check('帧号单调递增', recs[1]!.frame > recs[0]!.frame, true)
  check('每帧耗时为非负数', recs[0]!.ms >= 0, true)
  const withScroll = recs.filter(r => r.scroll.length > 0)
  check('至少有帧记录了 ScrollBox 几何', withScroll.length > 0, true)

  if (withScroll.length > 0) {
    const g = withScroll[0]!.scroll[0]!
    check('scrollHeight 为正', g.scrollHeight > 0, true)
    check('innerHeight 为正', g.innerHeight > 0, true)
    check('maxScroll = scrollHeight - innerHeight', g.maxScroll, Math.max(0, g.scrollHeight - g.innerHeight))
    check('渲染 scrollTop 落在合法区间', g.renderScrollTop >= 0 && g.renderScrollTop <= g.maxScroll, true)
  }

  const causes = new Set(recs.map(r => r.cause))
  check('帧被标注了成因（含默认 react-commit）', causes.size > 0, true)
  check('滚动触发的帧被标注为 scroll', causes.has('scroll'), true)
}

rmSync(dir, { recursive: true, force: true })
resetGeometryTraceForTest()

log(`\n\x1b[1m结果：\x1b[0m ${passed} 通过, ${failed} 失败\n`)
flush()
process.exit(failed === 0 ? 0 : 1)
