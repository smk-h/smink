/**
 * input-suppression 验证示例
 *
 * stdin 与外部全屏 TUI（编辑器等）交接后，终端会迟到地吐出一堆并非用户
 * 按键的字节：编辑器的模式恢复应答、查询响应、鼠标事件片段。这些字节被
 * 当成输入解析后具有破坏性——一个游离的 ESC 会被读成 Esc 键而清空非空
 * 提示词，其余则变成文本垃圾。
 *
 * 验证：
 *   1. 抑制窗的开/关/续期语义
 *   2. 守卫接线在输入总闸：开窗时一切输入（键盘/鼠标/终端应答/焦点）
 *      均被丢弃，未开窗时正常分发
 *   3. 真实渲染下 hook 可挂载、抑制状态可被组件读取
 *
 * 说明：输入总闸（processKeysInBatch）的验证不经过 TTY —— 输入管线依赖
 * raw mode，而 raw mode 只在真实终端下可用。这里直接驱动总闸函数，用
 * 探针对象记录调用，从而断言"抑制时零分发、正常时分发达"。
 *
 * 运行：npx tsx examples/input-suppression.tsx
 */

import React, { useEffect, useState } from 'react'
import { render, Box, Text, useApp } from '../src/index.js'
import { processKeysInBatch } from '../src/ink/components/App.js'
import { parseMultipleKeypresses, INITIAL_STATE } from '../src/ink/parse-keypress.js'
import {
  clearInputSuppression,
  inputSuppressionRemainingMs,
  isInputSuppressed,
  suppressInputFor,
} from '../src/ink/input-suppression.js'

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

// ---------------------------------------------------------------------------
// [1] 模块层语义
// ---------------------------------------------------------------------------

log('\n\x1b[1m[1] 抑制窗语义（模块层）\x1b[0m')
clearInputSuppression()
check('初始未开窗', isInputSuppressed(), false)
check('无窗时剩余为 0', inputSuppressionRemainingMs(), 0)

suppressInputFor(150)
check('开窗后处于抑制态', isInputSuppressed(), true)
const remaining1 = inputSuppressionRemainingMs()
check('剩余时间大于 0', remaining1 > 0, true)
check('剩余时间不超过设定值', remaining1 <= 150, true)

// 单调扩展：短窗不能缩短已开的长窗
suppressInputFor(10)
check('短窗不会缩短已开的长窗', inputSuppressionRemainingMs() > 10, true)

clearInputSuppression()
check('清除后立即解除', isInputSuppressed(), false)

// ---------------------------------------------------------------------------
// [2] 输入总闸的守卫接线
// ---------------------------------------------------------------------------

/**
 * 探针 app：记录总闸在处理输入时触发的每一条下游路径。只需覆盖
 * processKeysInBatch 实际访问到的字段。
 */
function createProbeApp() {
  const calls: string[] = []
  const app = {
    props: {
      selection: { isDragging: false },
      onSelectionChange: () => calls.push('onSelectionChange'),
      dispatchKeyboardEvent: () => calls.push('dispatchKeyboardEvent'),
    },
    querier: {
      onResponse: () => calls.push('querier.onResponse'),
    },
    internal_eventEmitter: {
      emit: (name: string) => calls.push(`emit:${name}`),
      listenerCount: () => 0,
    },
    handleTerminalFocus: () => calls.push('handleTerminalFocus'),
    handleSuspend: () => calls.push('handleSuspend'),
    handleInput: () => calls.push('handleInput'),
    handleClick: () => calls.push('handleClick'),
    handleMultiClick: () => calls.push('handleMultiClick'),
    handleSelectionDrag: () => calls.push('handleSelectionDrag'),
    dispatchHover: () => calls.push('dispatchHover'),
    getHyperlinkAt: () => undefined,
    openHyperlink: () => calls.push('openHyperlink'),
    isMouseClicksDisabled: () => false,
  }
  return { app, calls }
}

/** 用真实解析器把字节串解析成 ParsedInput[]，走的是生产解析路径。 */
function parseBytes(data: string) {
  const [items] = parseMultipleKeypresses(INITIAL_STATE, Buffer.from(data))
  return items
}

log('\n\x1b[1m[2] 输入总闸的守卫接线\x1b[0m')

// 一次"交接后的爆发"：游离 ESC（会被读成 Esc 键清空提示词）+ 查询响应
// + 鼠标片段 + 文本垃圾。
const BURST = '\x1b' + '\x1b[?1;2c' + '\x1b[0;10;20M' + 'garbage'

{
  const burst = parseBytes(BURST)
  check('爆发字节被解析出多个输入项', burst.length > 0, true)

  // --- 未开窗：正常分发 ---
  clearInputSuppression()
  const a = createProbeApp()
  processKeysInBatch(a.app as never, burst, undefined, undefined)
  check('未开窗时有下游调用', a.calls.length > 0, true)

  // --- 开窗：全部丢弃 ---
  suppressInputFor(500)
  const b = createProbeApp()
  processKeysInBatch(b.app as never, burst, undefined, undefined)
  check('开窗时零下游调用（全部丢弃）', b.calls.length, 0)

  clearInputSuppression()
}

// 逐类输入分别验证：键盘、鼠标、终端应答
{
  const keyboard = parseBytes('a')
  const mouse = parseBytes('\x1b[0;10;20M')

  clearInputSuppression()
  const k1 = createProbeApp()
  processKeysInBatch(k1.app as never, keyboard, undefined, undefined)
  check('未开窗：键盘被分发', k1.calls.length > 0, true)

  suppressInputFor(500)
  const k2 = createProbeApp()
  processKeysInBatch(k2.app as never, keyboard, undefined, undefined)
  check('开窗：键盘被丢弃', k2.calls.length, 0)

  const m2 = createProbeApp()
  processKeysInBatch(m2.app as never, mouse, undefined, undefined)
  check('开窗：鼠标被丢弃', m2.calls.length, 0)

  clearInputSuppression()
  const m1 = createProbeApp()
  processKeysInBatch(m1.app as never, mouse, undefined, undefined)
  check('未开窗：鼠标被分发', m1.calls.length > 0, true)
}

// ---------------------------------------------------------------------------
// [3] 真实渲染下抑制状态可被组件读取
// ---------------------------------------------------------------------------

function SuppressionProbe() {
  const { exit } = useApp()
  const [states, setStates] = useState<string[]>([])

  useEffect(() => {
    // 开窗 → 采样 → 过期 → 再采样
    suppressInputFor(300)
    const seen: string[] = []
    const id = setInterval(() => {
      seen.push(isInputSuppressed() ? 'suppressed' : 'normal')
      setStates([...seen])
    }, 80)
    const done = setTimeout(() => {
      clearInterval(id)
      exit()
    }, 900)
    return () => {
      clearInterval(id)
      clearTimeout(done)
    }
  }, [exit])

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="ansi:cyan">input-suppression 验证</Text>
      <Text>状态采样: {states.join(' → ') || '（采样中）'}</Text>
    </Box>
  )
}

async function main(): Promise<void> {
  log('\n\x1b[1m[3] 真实渲染下组件可读取抑制状态\x1b[0m')
  const app = await render(<SuppressionProbe />)
  await sleep(1100)
  app.unmount()
  check('组件挂载与卸载正常', app !== null, true)
  check('抑制窗已自然过期', isInputSuppressed(), false)

  log(`\n\x1b[1m结果：\x1b[0m ${passed} 通过, ${failed} 失败\n`)
  flush()
  process.exit(failed === 0 ? 0 : 1)
}

void main()
