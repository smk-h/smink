/**
 * bgChanged（背景色变化时阻断 blit）验证示例
 *
 * 干净的（!dirty 且布局未变）节点会走 blit 快路径：直接把 prevScreen 里
 * 对应矩形搬过来，跳过重新渲染。
 *
 * 问题：节点自身带 backgroundColor 时，父级每帧都会用该色填满整个内框再画
 * 子节点。背景色一变（hover 高亮开关），旧的底色还留在 prevScreen 里：
 *
 *   1. 带底色的父级自己是 dirty 的，重画新底色（或把底色移除）
 *   2. 它的子节点布局没变、自己也不 dirty，于是走 blit 快路径
 *   3. blit 把 prevScreen 里带旧底色的格子原样搬回来，盖在新画的内容上
 *   4. 于是新帧与 prevScreen 完全一致 → diff 找不到差异 → 高亮永远清不掉
 *
 * 方案：把节点的有效背景色（自身 backgroundColor ?? 继承来的）记进
 * nodeCache.bg；本帧取值与上次不同即判定 bgChanged——该节点自身不走 blit，
 * 且带底色的父级还要连带禁用其全部子节点的 blit（renderChildren 传
 * undefined）。
 *
 * 断言不比对写出的 ANSI 字符串（chalk 在非 TTY 下会降级成无色，不可靠），
 * 而是直读已提交屏幕格子的 styleId，经 StylePool 解出 SGR 序列再判断。
 *
 * 运行：npx tsx examples/bg-changed.tsx
 */

import { EventEmitter } from 'node:events'
import React from 'react'
// 背景色由 chalk 输出，而 chalk 在导入时按 stdout 探测颜色等级：非 TTY 下
// level=0，背景 SGR 会被整个丢掉，本例的断言就无从谈起。必须在 chalk 被
// 导入之前把等级抬起来——所以下面全部走动态 import。
process.env.FORCE_COLOR = '1'

const { renderSync, Box, Text } = await import('../src/index.js')
const { nodeCache } = await import('../src/ink/node-cache.js')
const { cellAt } = await import('../src/ink/screen.js')
const { default: instances } = await import('../src/ink/instances.js')
type DOMElement = import('../src/ink/dom.js').DOMElement
type StylePool = import('../src/ink/screen.js').StylePool
type Screen = import('../src/ink/screen.js').Screen

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

/** 记录每次写出的假 stdout。isTTY=false → log-update 每帧整屏写出。 */
class FakeStdout extends EventEmitter {
  columns = 20
  rows = 3
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

/** 背景色 SGR：40-47 / 100-107 / 48;5;N / 48;2;R;G;B。 */
const BG_RE = /^\x1b\[(4[0-7]|10[0-7]|48(;[25])?([;0-9]*)?)m$/

function hasBackground(styles: { code: string }[]): boolean {
  return styles.some(s => BG_RE.test(s.code))
}

/** 读已提交屏幕第 y 行的全部格子，返回其纯文本与带背景色的格子数。 */
function readRow(
  screen: Screen,
  stylePool: StylePool,
  y: number,
  width: number,
): { text: string; bgCells: number } {
  let text = ''
  let bgCells = 0
  for (let x = 0; x < width; x++) {
    const cell = cellAt(screen, x, y)
    if (!cell) continue
    text += cell.char
    if (hasBackground(stylePool.get(cell.styleId))) bgCells++
  }
  return { text: text.trim(), bgCells }
}

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms))

// smink 的颜色值带 ansi: 前缀（colorize.ts 按此分派到 chalk.bgRed 等）。
const RED = 'ansi:red'
const BLUE = 'ansi:blue'

const tree = (bg?: string): React.ReactElement =>
  React.createElement(
    Box,
    null,
    React.createElement(
      Box,
      bg ? { backgroundColor: bg } : null,
      React.createElement(Text, null, 'hovered'),
    ),
  )

async function main(): Promise<void> {
  const stdout = new FakeStdout()
  const stdin = new FakeStdin()
  const stream = stdout as unknown as NodeJS.WriteStream

  console.log('\n\x1b[1m[1] 第一帧：内层 Box 带红底\x1b[0m')

  const app = renderSync(tree(RED), {
    stdout: stream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    patchConsole: false,
  })
  await sleep(30)

  const ink = instances.get(stream) as unknown as {
    rootNode: DOMElement
    frontFrame: { screen: Screen }
    stylePool: StylePool
  }

  const row0 = readRow(ink.frontFrame.screen, ink.stylePool, 0, 7)
  check('第一帧写出文本内容', row0.text, 'hovered')
  check('第一帧 7 个格子全部带背景色', row0.bgCells, 7)

  console.log('\n\x1b[1m[2] nodeCache 记录了有效背景色\x1b[0m')

  const outer = ink.rootNode.childNodes[0] as DOMElement
  const inner = outer.childNodes[0] as DOMElement
  check('内层节点是 ink-box', inner.nodeName, 'ink-box')
  check(`内层缓存记录了 bg=${RED}`, nodeCache.get(inner)?.bg, RED)
  check('外层自身无底色，缓存 bg 为空', nodeCache.get(outer)?.bg, undefined)

  console.log('\n\x1b[1m[3] 第二帧：移除底色，旧底色不得被 blit 复活\x1b[0m')

  // 只改内层 Box 的 backgroundColor，其余完全一致：外层干净、文本节点
  // 干净且布局未变，两者都会尝试走 blit 快路径。
  app.rerender(tree())
  await sleep(30)

  const row1 = readRow(ink.frontFrame.screen, ink.stylePool, 0, 7)
  check('第二帧仍写出文本内容', row1.text, 'hovered')
  check(
    '第二帧不带任何背景色（旧红底未被 blit 复活）',
    row1.bgCells,
    0,
  )
  check('内层缓存已更新为无底色', nodeCache.get(inner)?.bg, undefined)

  console.log('\n\x1b[1m[4] 第三帧：重新加回底色\x1b[0m')

  app.rerender(tree(BLUE))
  await sleep(30)

  const row2 = readRow(ink.frontFrame.screen, ink.stylePool, 0, 7)
  check('第三帧重新带上背景色', row2.bgCells, 7)
  check(`内层缓存更新为 ${BLUE}`, nodeCache.get(inner)?.bg, BLUE)

  app.unmount()

  console.log(`\n\x1b[1m结果：\x1b[0m ${passed} 通过, ${failed} 失败\n`)
  process.exit(failed === 0 ? 0 : 1)
}

void main()
