/**
 * DECSTBM 硬件滚动验证示例
 *
 * ScrollBox 滚动一屏内容时，朴素做法是整屏重绘：视口里的每一行都要重新
 * 写一遍，20 行内容只滚 3 行也要写 20 行。DECSTBM 把这件事变成"硬件滚动
 * + 只补画进入视口的那几行"：
 *
 *   1. 对 prev.screen 做 shiftRows()，模拟终端的 CSI n S / CSI n T
 *   2. diff 循环因此只在"滚进来的新行"上找到差异
 *   3. 补丁前缀带上 DECSTBM 序列，让真实终端做同样的事
 *
 * 净效果：滚动 delta 行只需写 delta 行，而不是整个滚动区域。
 *
 * log-update.ts 的 decstbmSafe 参数控制这条路径。ink.tsx 传的是
 * SYNC_OUTPUT_SUPPORTED —— 没有 DEC 2026 / BSU/ESU 就没法把
 * "区域滚动"和"补画边缘行"做成原子操作，终端会闪出中间态，所以那种
 * 环境下宁可多写字节也不发 DECSTBM。
 *
 * 本例直接在 LogUpdate 层驱动（不经过 Ink 实例），这样能精确控制
 * decstbmSafe 开关，把 DECSTBM 路径与回退路径放在同一组帧上对比。
 *
 * 运行：npx tsx examples/decstbm-scroll.tsx
 */

import type { Diff, Frame } from '../src/ink/frame.js'
import { LogUpdate } from '../src/ink/log-update.js'
import Output from '../src/ink/output.js'
import { optimize } from '../src/ink/optimizer.js'
import {
  CharPool,
  createScreen,
  HyperlinkPool,
  StylePool,
} from '../src/ink/screen.js'

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

// 终端 40x24，内容 20 行。内容行数小于视口高度，以避开 log-update 的
// scrollback 全量重置路径——那条路径一旦命中就整屏重绘，测不出 DECSTBM
// 的收益。我们要测的正是稳态滚动。
const WIDTH = 40
const VIEWPORT_HEIGHT = 24
const CONTENT_ROWS = 20
const REGION_TOP = 0
const REGION_BOTTOM = CONTENT_ROWS - 1

// DECSTBM 序列：scrollPatch 的第一片就是它。
const SET_REGION = `\x1b[${REGION_TOP + 1};${REGION_BOTTOM + 1}r`

const stylePool = new StylePool()
const charPool = new CharPool()
const hyperlinkPool = new HyperlinkPool()

// 行内容用的字符集。61 是素数且大于本例用到的最大行号 39，配合下面的线性
// 映射，能保证任意两行在任意一列上都不相同。
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const ALPHABET_MOD = 61

/**
 * 第 i 行的内容。整行填满、不含空格，且任意两行的每一列都不同。
 *
 * 这个性质是断言能成立的前提：diff 是按格写的，前后两帧相同的格子会被
 * 跳过。只要有一列碰巧相同，"这一行被重写了"就没法靠整行子串匹配检出。
 * 同理不能用空格——空格格会被当成空白跳过。
 */
function rowText(index: number): string {
  let out = ''
  for (let x = 0; x < WIDTH; x++) {
    out += ALPHABET[(index * 13 + x * 7) % ALPHABET_MOD]
  }
  return out
}

/** 造一帧：屏幕上依次是第 startLine 起的 CONTENT_ROWS 行。 */
function buildFrame(startLine: number, scrollHint?: Frame['scrollHint']): Frame {
  const screen = createScreen(
    WIDTH,
    CONTENT_ROWS,
    stylePool,
    charPool,
    hyperlinkPool,
  )
  const output = new Output({
    width: WIDTH,
    height: CONTENT_ROWS,
    stylePool,
    screen,
  })
  for (let r = 0; r < CONTENT_ROWS; r++) {
    output.write(0, r, rowText(startLine + r))
  }
  return {
    screen: output.get(),
    viewport: { width: WIDTH, height: VIEWPORT_HEIGHT },
    cursor: { x: 0, y: 0, visible: true },
    scrollHint: scrollHint ?? null,
  }
}

type Metrics = {
  /** optimize() 之后的补丁条数 */
  patches: number
  /** 所有 stdout 补丁的字节数之和——真正要往终端写的量 */
  textBytes: number
  /** 拼接后的可见文本，用于"哪几行被重写了"的内容断言 */
  text: string
}

function measure(diff: Diff): Metrics {
  let text = ''
  let textBytes = 0
  for (const patch of diff) {
    if (patch.type === 'stdout') {
      text += patch.content
      textBytes += patch.content.length
    }
  }
  return { patches: diff.length, textBytes, text }
}

const log = new LogUpdate({ isTTY: true, stylePool })

/**
 * 同一组帧跑两遍：一次开 DECSTBM，一次强制回退。
 *
 * scrollHint 挂在 next 帧上（render() 读的是 next.scrollHint），回退那次
 * 干脆不给 hint。render() 会用 shiftRows 就地改 prev.screen，所以每次都要
 * 造新帧，两遍之间不能复用。
 */
function renderScroll(from: number, delta: number): {
  decstbm: Metrics
  fallback: Metrics
} {
  const hint = { top: REGION_TOP, bottom: REGION_BOTTOM, delta }
  const decstbm = measure(
    optimize(
      log.render(buildFrame(from), buildFrame(from + delta, hint), true, true),
    ),
  )
  const fallback = measure(
    optimize(
      log.render(buildFrame(from), buildFrame(from + delta), true, false),
    ),
  )
  return { decstbm, fallback }
}

console.log('\n\x1b[1m[1] 向下滚 3 行：只补画滚进来的 3 行\x1b[0m')

// from=0 时屏幕上是 row 00..19；滚 3 行后是 row 03..22。
// 稳定下来的 row 03..19 不该被重写，只有 row 20/21/22 需要写。
const down3 = renderScroll(0, 3)

check('DECSTBM 路径发出设置滚动区序列', down3.decstbm.text.includes(SET_REGION), true)
check('DECSTBM 路径发出 CSI 3 S（区域上滚 3 行）', down3.decstbm.text.includes('\x1b[3S'), true)
check('回退路径不发出设置滚动区序列', down3.fallback.text.includes(SET_REGION), false)
check('回退路径不发出 CSI S', down3.fallback.text.includes('\x1b[3S'), false)

check('新进入视口的第 20 行被写出', down3.decstbm.text.includes(rowText(20)), true)
check('新进入视口的第 21 行被写出', down3.decstbm.text.includes(rowText(21)), true)
check('新进入视口的第 22 行被写出', down3.decstbm.text.includes(rowText(22)), true)
// 注意断言的是"内容行"而不是"屏幕行"：滚动后屏幕第 10 行装的是内容
// 第 13 行。稳定行指的是滚动前后位置没动的内容——DECSTBM 靠硬件位移
// 保留了它们，回退路径只能逐行重画。
check(
  'DECSTBM 路径不重写稳定内容行（第 13 行）',
  down3.decstbm.text.includes(rowText(13)),
  false,
)
check(
  '回退路径重写了稳定内容行（第 13 行）',
  down3.fallback.text.includes(rowText(13)),
  true,
)

console.log('\n\x1b[1m[2] 补丁量：滚动 3 行 vs 重绘 20 行\x1b[0m')

const down3Ratio = down3.decstbm.textBytes / down3.fallback.textBytes
console.log(
  `      DECSTBM: ${down3.decstbm.patches} 补丁 / ${down3.decstbm.textBytes} 字节`,
)
console.log(
  `      回退    : ${down3.fallback.patches} 补丁 / ${down3.fallback.textBytes} 字节`,
)
console.log(`      字节占比: ${(down3Ratio * 100).toFixed(1)}%`)

check('DECSTBM 写出的字节数不到回退的三分之一', down3Ratio < 1 / 3, true)
check('DECSTBM 补丁条数更少', down3.decstbm.patches < down3.fallback.patches, true)

console.log('\n\x1b[1m[3] 滚动量越大，相对收益越低（但绝对量仍只等于滚入行数）\x1b[0m')

const down1 = renderScroll(0, 1)
const down8 = renderScroll(0, 8)

check('滚 1 行比滚 8 行写得少', down1.decstbm.textBytes < down8.decstbm.textBytes, true)
check('滚 1 行仍走 DECSTBM', down1.decstbm.text.includes(SET_REGION), true)
check('滚 8 行仍走 DECSTBM', down8.decstbm.text.includes(SET_REGION), true)
check(
  '滚 1 行的字节占比低于滚 8 行',
  down1.decstbm.textBytes / down1.fallback.textBytes <
    down8.decstbm.textBytes / down8.fallback.textBytes,
  true,
)
check(
  '滚 8 行时也只有 8 行进入视口（内容第 20..27 行）',
  down8.decstbm.text.includes(rowText(27)) &&
    !down8.decstbm.text.includes(rowText(19)),
  true,
)

console.log('\n\x1b[1m[4] 向上滚：CSI T 方向相反，边缘行落在顶部\x1b[0m')

// from=10 时屏幕上是 row 10..29；向上滚 3 行后是 row 07..26。
// 新进入视口的 row 07/08/09 落在区域顶部。
const up3 = renderScroll(10, -3)

check('向上滚发出 CSI 3 T', up3.decstbm.text.includes('\x1b[3T'), true)
check('向上滚不发出 CSI S', up3.decstbm.text.includes('\x1b[3S'), false)
check('顶部新行（第 07 行）被写出', up3.decstbm.text.includes(rowText(7)), true)
check('顶部新行（第 08 行）被写出', up3.decstbm.text.includes(rowText(8)), true)
check('顶部新行（第 09 行）被写出', up3.decstbm.text.includes(rowText(9)), true)
check(
  '向上滚不重写稳定行（第 20 行）',
  up3.decstbm.text.includes(rowText(20)),
  false,
)
check('向上滚的字节数也远低于回退', up3.decstbm.textBytes < up3.fallback.textBytes / 3, true)

console.log('\n\x1b[1m[5] 整区滚动：退化为全量重绘，不留下陈旧行\x1b[0m')

// |delta| >= 区域高度时 shiftRows 会清空整个区域，diff 因此覆盖全部行。
// 这是有意的降级：宁可全量重绘，也不能让滚出去的行留在屏幕上。
// （render-node-to-output 侧还有一道 Math.abs(delta) < innerHeight 的闸，
// 实际上根本不会给 LogUpdate 递这种 hint；这里守住的是万一递过来也不出错。）
const full = renderScroll(0, CONTENT_ROWS)

check(
  '整区滚动时仍不残留陈旧行（退化为全量重绘）',
  full.decstbm.textBytes >= full.fallback.textBytes * 0.9,
  true,
)
check('整区滚动时写满全部 20 行', full.decstbm.text.includes(rowText(39)), true)

console.log(`\n\x1b[1m结果：\x1b[0m ${passed} 通过, ${failed} 失败\n`)
process.exit(failed === 0 ? 0 : 1)
