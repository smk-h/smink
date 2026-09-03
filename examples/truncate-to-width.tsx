/**
 * truncateToWidth 验证示例
 *
 * 纯函数验证：按终端单元格宽度截断字符串，逐 code point 遍历。
 * 覆盖 ASCII、CJK 宽字符、emoji、组合字符、零宽字符与边界情况。
 *
 * 运行：npx tsx examples/truncate-to-width.tsx
 */

import { truncateToWidth } from '../src/ink/truncateToWidth.js'
import { stringWidth } from '../src/ink/stringWidth.js'

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

/** 不变量：结果宽度永不超过上限，且结果是原串前缀。 */
function checkInvariant(name: string, text: string, maxWidth: number): string {
  const out = truncateToWidth(text, maxWidth)
  const w = stringWidth(out)
  const prefixOk = text.startsWith(out)
  const widthOk = w <= maxWidth
  const ok = prefixOk && widthOk
  if (ok) {
    passed++
    console.log(`  \x1b[32m✓\x1b[0m ${name} → "${out}" (宽度 ${w}/${maxWidth})`)
  } else {
    failed++
    console.log(`  \x1b[31m✗\x1b[0m ${name} → "${out}"`)
    console.log(`      宽度超限: ${!widthOk} (${w} > ${maxWidth})`)
    console.log(`      非前缀: ${!prefixOk}`)
  }
  return out
}

console.log('\n\x1b[1m[1] ASCII 基本截断\x1b[0m')
check('纯 ASCII 截取前 5 列', truncateToWidth('hello world', 5), 'hello')
check('上限大于串长时原样返回', truncateToWidth('abc', 10), 'abc')
check('上限为 0 返回空串', truncateToWidth('abc', 0), '')
check('空串返回空串', truncateToWidth('', 10), '')

console.log('\n\x1b[1m[2] CJK 宽字符（每个占 2 列，不可从中间劈开）\x1b[0m')
check('中文 5 字截到 6 列 → 3 字', truncateToWidth('一二三四五', 6), '一二三')
check('中文 5 字截到 7 列 → 仍是 3 字（奇数余量不劈字）', truncateToWidth('一二三四五', 7), '一二三')
check('中文截到 1 列 → 空串（一个字都放不下）', truncateToWidth('一二三四五', 1), '')
check('中英混排按列宽累加', truncateToWidth('ab中文cd', 6), 'ab中文')

console.log('\n\x1b[1m[3] Emoji 与代理对（不产生孤代理）\x1b[0m')
checkInvariant('emoji 串截到 4 列', '🎉🎊🎈🎁', 4)
checkInvariant('emoji 串截到 3 列', '🎉🎊🎈🎁', 3)
const emojiOut = truncateToWidth('a🎉b', 3)
check('a + emoji 截到 3 列', emojiOut, 'a🎉')
check(
  'emoji 不产生孤代理（无 U+D800-U+DFFF 单独出现）',
  /\p{Surrogate}/u.test(emojiOut),
  false,
)

console.log('\n\x1b[1m[4] 组合字符与零宽字符\x1b[0m')
checkInvariant('带组合音符的拉丁字母', 'e\u0301cole', 4)
checkInvariant('零宽连接符序列（家庭 emoji）', '👨\u200D👩\u200D👧', 3)

console.log('\n\x1b[1m[5] 不变量：宽度不超限且必为前缀（随机扫描）\x1b[0m')
const samples = [
  'Hello, 世界！',
  'こんにちは世界',
  '한국어 텍스트',
  'mixed 🌍 中文 ascii 12345',
  '一',
  '🎉',
  'a',
]
let invariantOk = true
for (const text of samples) {
  for (let w = 0; w <= stringWidth(text) + 2; w++) {
    const out = truncateToWidth(text, w)
    if (stringWidth(out) > w || !text.startsWith(out)) {
      invariantOk = false
      console.log(
        `      失败: "${text}" @${w} → "${out}" (宽度 ${stringWidth(out)})`,
      )
    }
  }
}
check('全部样例在所有宽度下均满足不变量', invariantOk, true)

console.log(
  `\n\x1b[1m结果：\x1b[0m ${passed} 通过, ${failed} 失败\n`,
)
process.exit(failed === 0 ? 0 : 1)
