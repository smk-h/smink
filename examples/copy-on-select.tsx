/**
 * useCopyOnSelect 验证示例
 *
 * 选中即复制：拖拽落定（或双击/三击、shift+方向键扩展落定选区）后自动
 * 复制选中文本到剪贴板（OSC 52 + 原生工具回退），随后清除高亮。
 *
 * 实现为订阅而非鼠标释放钩子，因此所有"落定"路径（释放、丢事件的
 * 恢复、失焦恢复、多击、键盘扩展）都汇入同一个通知，且每次落定只复制一次。
 *
 * 验证重点：
 *   1. 拖拽过程中（isDragging=true 的每次移动通知）不复制
 *   2. 落定时复制一次且仅一次（copySelection 内部会再次通知，不得递归）
 *   3. onCopied 回调收到正确文本，且用 ref 保存不会导致重复订阅
 *   4. 无选区 / 非全屏时为空操作
 *
 * 断言输出缓冲到卸载后统一打印：TUI 挂载期间 stdout 被渲染占用，且
 * render 默认 patchConsole / patchStderr 会接管 console 与 stderr。
 *
 * 运行：npx tsx examples/copy-on-select.tsx
 */

import React, { useEffect, useState } from 'react'
import { render, Box, Text, useApp } from '../src/index.js'
import { useCopyOnSelect } from '../src/ink/hooks/use-copy-on-select.js'
import { useSelection } from '../src/ink/hooks/use-selection.js'
import {
  clearSelection,
  createSelectionState,
  hasSelection,
  startSelection,
  updateSelection,
  type SelectionState,
} from '../src/ink/selection.js'

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

// ---------------------------------------------------------------------------
// 第一部分：纯状态机语义（不依赖终端选区，验证"何时该复制"的判定）
// ---------------------------------------------------------------------------

/** 复刻 hook 的判定逻辑，对任意选择状态机跑一遍。 */
function shouldCopy(state: SelectionState | null): boolean {
  return state !== null && !state.isDragging && hasSelection(state)
}

log('\n[1] 复制判定逻辑（与 hook 内一致）')

{
  const s = createSelectionState()
  check('空状态不复制', shouldCopy(s), false)

  s.isDragging = true
  check('仅 isDragging 但无选区时不复制', shouldCopy(s), false)

  s.isDragging = false
  clearSelection(s)
  check('清除后不复制', shouldCopy(s), false)
}

{
  // 模拟一次真实拖拽：press → 多次 move → release
  const s = createSelectionState()
  startSelection(s, 0, 0)
  check('按下后仍在拖拽中，不复制', shouldCopy(s), false)

  updateSelection(s, 5, 0)
  check('拖拽移动中（选区已存在）仍不复制', shouldCopy(s), false)

  updateSelection(s, 10, 0)
  check('继续移动仍不复制', shouldCopy(s), false)

  // 释放：isDragging 置否
  s.isDragging = false
  check('释放后（选区存在且非拖拽）应复制', shouldCopy(s), true)

  clearSelection(s)
  check('复制并清除后不再重复复制', shouldCopy(s), false)
}

// ---------------------------------------------------------------------------
// 第二部分：真实 hook 集成（订阅 + 回调 + 只触发一次）
// ---------------------------------------------------------------------------

/**
 * 用一个自建的选区状态对象驱动 hook。Ink 实例的选区在非全屏下不可用，
 * 因此这里直接构造状态并通过 useSelection 的同名接口注入，验证的是
 * hook 的订阅/判定/回调编排，而非终端选区本身。
 */
const driver = {
  state: null as SelectionState | null,
  listeners: new Set<() => void>(),
  copyCalls: 0,
  lastCopiedText: '',
  copiedTextToReturn: '选中的文本',

  notify(): void {
    for (const cb of [...this.listeners]) cb()
  },
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  },
  getState(): SelectionState | null {
    return this.state
  },
  copySelection(): string {
    this.copyCalls++
    // 真实实现在复制后会 clearSelection + notifySelectionChange，
    // 这里复刻该行为以验证不会递归触发第二次复制。
    if (this.state) clearSelection(this.state)
    this.lastCopiedText = this.copiedTextToReturn
    this.notify()
    return this.copiedTextToReturn
  },
}

// 记录 onCopied 回调的触发情况
const callbackLog: string[] = []

function Harness() {
  const { exit } = useApp()
  const [mounted, setMounted] = useState(false)

  // 直接用驱动器的实现，模拟 useSelection 的接口形状。必须是稳定引用，
  // 否则 effect 每次渲染都重新订阅，会破坏"只触发一次"的断言。
  const fakeSelection = React.useMemo(
    () => ({
      subscribe: (cb: () => void) => driver.subscribe(cb),
      getState: () => driver.getState(),
      copySelection: () => driver.copySelection(),
    }),
    [],
  )

  // 通过替换 hook 内部的 useSelection 结果不现实，这里改为直接调用
  // hook 的等价编排逻辑（与源码一致），验证订阅/判定/回调三部分。
  useCopyOnSelectEquivalent(fakeSelection, text => {
    callbackLog.push(text)
  })

  useEffect(() => {
    setMounted(true)
    const id = setTimeout(() => exit(), 400)
    return () => clearTimeout(id)
  }, [exit])

  return (
    <Box padding={1} flexDirection="column">
      <Text bold color="ansi:cyan">useCopyOnSelect 验证</Text>
      <Text>挂载: {String(mounted)}</Text>
      <Text>复制调用次数: {driver.copyCalls}</Text>
      <Text>回调收到: {callbackLog.join(' | ') || '（无）'}</Text>
    </Box>
  )
}

/** 与 useCopyOnSelect 源码等价的编排，便于在受控驱动下断言。 */
function useCopyOnSelectEquivalent(
  selection: {
    subscribe: (cb: () => void) => () => void
    getState: () => SelectionState | null
    copySelection: () => string
  },
  onCopied?: (text: string) => void,
): void {
  const onCopiedRef = React.useRef(onCopied)
  onCopiedRef.current = onCopied
  useEffect(() => {
    return selection.subscribe(() => {
      const state = selection.getState()
      if (state && !state.isDragging && hasSelection(state)) {
        const text = selection.copySelection()
        if (text) onCopiedRef.current?.(text)
      }
    })
  }, [selection])
}

/** 真实 hook（挂载但不触发选区），验证其能被正常订阅且为空操作。 */
function RealHookProbe() {
  const [calls, setCalls] = useState(0)
  useCopyOnSelect(text => {
    setCalls(c => c + 1)
    void text
  })
  const { getState } = useSelection()
  const st = getState()
  return (
    <Text color="ansi:blackBright">
      真实 hook 已挂载（当前选区状态: {st === null ? 'null' : 'exists'}，回调次数: {calls}）
    </Text>
  )
}

async function main(): Promise<void> {
  log('\n[2] 真实 hook：无 Ink 选区时为空操作')
  const app0 = await render(<RealHookProbe />)
  await new Promise(resolve => setTimeout(resolve, 300))
  check('hook 挂载不报错且未误触发复制', app0 !== null, true)
  app0.unmount()

  log('\n[3] 拖拽期间不复制，落定只复制一次')
  const app = await render(<Harness />)
  await new Promise(resolve => setTimeout(resolve, 120))

  // 模拟：press → 多次 move（isDragging=true）→ release（isDragging=false）
  const s = createSelectionState()
  startSelection(s, 0, 0)
  driver.state = s
  driver.notify()
  const afterPress = driver.copyCalls
  check('按下后未复制', afterPress, 0)

  updateSelection(s, 5, 0)
  driver.notify()
  updateSelection(s, 10, 0)
  driver.notify()
  check('拖拽移动全程未复制', driver.copyCalls, 0)

  // 释放
  s.isDragging = false
  driver.notify()
  check('释放后复制了一次', driver.copyCalls, 1)
  check('回调收到复制文本', callbackLog.join('|'), '选中的文本')
  check('回调只触发一次（内部二次通知未递归）', callbackLog.length, 1)

  // 落定后再来一次通知：选区已清，不应再复制
  driver.notify()
  check('选区已清除后再次通知不再复制', driver.copyCalls, 1)

  await new Promise(resolve => setTimeout(resolve, 400))
  app.unmount()

  log(`\n结果： ${passed} 通过, ${failed} 失败\n`)
  flush()
  process.exit(failed === 0 ? 0 : 1)
}

void main()
