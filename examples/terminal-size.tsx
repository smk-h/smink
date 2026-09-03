/**
 * useTerminalSize 验证示例
 *
 * 从 TerminalSizeContext 读取终端尺寸。验证三件事：
 *   1. 在 App 内返回与终端一致的实时尺寸
 *   2. 尺寸变化时响应式更新（受控 Provider + rerender 确定性验证；
 *      真实 OS resize 仅在 TTY 环境下额外验证）
 *   3. 缺少 Provider 时抛出明确错误，而不是静默返回 undefined
 *
 * 断言输出缓冲到卸载后统一打印：TUI 挂载期间 stdout 被渲染占用，且
 * render 默认 patchConsole 接管 console.*、patchStderr 吞掉
 * process.stderr.write（防止杂散写入破坏 alt-screen 缓冲区）。
 *
 * 运行：npx tsx examples/terminal-size.tsx
 */

import React, { Component, useEffect, useState, type ReactNode } from 'react'
import {
  render,
  Box,
  Text,
  TerminalSizeContext,
  useTerminalSize,
  useApp,
} from '../src/index.js'

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

/** 组件观察到的状态回传，供卸载后断言。 */
const observed: {
  sizes: { columns: number; rows: number }[]
  controlledSizes: { columns: number; rows: number }[]
  caughtError: string | null
} = { sizes: [], controlledSizes: [], caughtError: null }

/** 捕获子树抛出的错误，用于验证缺少 Provider 时应报错的守卫分支。 */
class ErrorBoundary extends Component<
  { children: ReactNode; onError: (message: string) => void },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error): void {
    this.props.onError(error.message)
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children
  }
}

function Probe() {
  const size = useTerminalSize()

  useEffect(() => {
    observed.sizes.push({ columns: size.columns, rows: size.rows })
  }, [size.columns, size.rows])

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="ansi:cyan">useTerminalSize 验证</Text>
      <Text>
        当前尺寸: {size.columns} x {size.rows}（列 x 行）
      </Text>
      <Text color="ansi:blackBright">
        终端实际: {process.stdout.columns || 80} x {process.stdout.rows || 24}
      </Text>
      <Text color={size.columns > 0 && size.rows > 0 ? 'ansi:green' : 'ansi:red'}>
        {size.columns > 0 && size.rows > 0 ? '尺寸有效' : '尺寸无效'}
      </Text>
    </Box>
  )
}

/**
 * 受控验证：外层 Provider 值由外部持有，rerender 改值后子组件必须观察到
 * 新尺寸。不依赖 OS resize 事件，因此在非 TTY 环境下也确定可验证。
 */
function ControlledHost({ size }: { size: { columns: number; rows: number } }) {
  return (
    <TerminalSizeContext.Provider value={size}>
      <ControlledProbe />
    </TerminalSizeContext.Provider>
  )
}

function ControlledProbe() {
  const size = useTerminalSize()
  useEffect(() => {
    observed.controlledSizes.push({ columns: size.columns, rows: size.rows })
  }, [size.columns, size.rows])
  return (
    <Box padding={1}>
      <Text>
        受控尺寸: {size.columns} x {size.rows}
      </Text>
    </Box>
  )
}

/** 缺少 Provider 时的守卫分支：应当抛出，由 ErrorBoundary 接住。 */
function OutsideProvider() {
  return (
    <Box flexDirection="column">
      <ErrorBoundary onError={m => { observed.caughtError = m }}>
        <TerminalSizeContext.Provider value={null}>
          <ConsumerOutsideProvider />
        </TerminalSizeContext.Provider>
      </ErrorBoundary>
      <Text color="ansi:blackBright">
        守卫错误信息: {observed.caughtError ?? '（未捕获）'}
      </Text>
    </Box>
  )
}

function ConsumerOutsideProvider() {
  useTerminalSize()
  return null
}

function Exiter({ ms }: { ms: number }) {
  const { exit } = useApp()
  const [done, setDone] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => {
      setDone(true)
      exit()
    }, ms)
    return () => clearTimeout(id)
  }, [exit, ms])
  return (
    <Text color="ansi:blackBright">{done ? '' : `${ms / 1000} 秒后自动退出`}</Text>
  )
}

async function main(): Promise<void> {
  log('\n\x1b[1m[1] App 内的行为\x1b[0m')

  const app = await render(
    <Box flexDirection="column">
      <Probe />
      <OutsideProvider />
      <Exiter ms={1200} />
    </Box>,
  )

  // 框架取尺寸的规则：stdout.columns || 80（非 TTY 时回落到 80x24）。
  const realColumns = process.stdout.columns || 80
  const realRows = process.stdout.rows || 24

  check('返回了列数', typeof observed.sizes[0]?.columns, 'number')
  check('返回了行数', typeof observed.sizes[0]?.rows, 'number')
  check('列数与终端实际列数一致', observed.sizes[0]?.columns, realColumns)
  check('行数与终端实际行数一致', observed.sizes[0]?.rows, realRows)
  check('尺寸为正', (observed.sizes[0]?.columns ?? 0) > 0, true)

  await new Promise(resolve => setTimeout(resolve, 1500))
  app.unmount()

  // --- 受控响应式验证：不依赖 TTY / OS resize ---
  log('\n\x1b[1m[2] 尺寸变化的响应式更新\x1b[0m')
  const app2 = await render(<ControlledHost size={{ columns: 40, rows: 10 }} />)
  await new Promise(resolve => setTimeout(resolve, 200))
  check('初始读到受控尺寸', observed.controlledSizes[0]?.columns, 40)
  check('初始读到受控行数', observed.controlledSizes[0]?.rows, 10)

  app2.rerender(<ControlledHost size={{ columns: 64, rows: 20 }} />)
  await new Promise(resolve => setTimeout(resolve, 300))
  const latest = observed.controlledSizes[observed.controlledSizes.length - 1]
  check('rerender 后读到新列数', latest?.columns, 64)
  check('rerender 后读到新行数', latest?.rows, 20)
  check('两次尺寸都被观察到', observed.controlledSizes.length >= 2, true)
  app2.unmount()

  // --- 真实 OS resize：只在 TTY 下有意义（非 TTY 时 ink 不注册监听）---
  if (process.stdout.isTTY) {
    log('\n\x1b[1m[3] 真实 OS resize（TTY）\x1b[0m')
    const app3 = await render(<Probe />)
    await new Promise(resolve => setTimeout(resolve, 200))
    check('resize 监听器已注册', process.stdout.listenerCount('resize') > 0, true)
    app3.unmount()
  } else {
    log('\n\x1b[1m[3] 真实 OS resize\x1b[0m')
    log('  \x1b[33m!\x1b[0m 非 TTY 环境：ink 不注册 resize 监听，已由第 2 节受控验证覆盖')
  }

  log('\n\x1b[1m[4] 缺少 Provider 时的守卫\x1b[0m')
  check('捕获到错误而非静默返回', observed.caughtError !== null, true)
  check(
    '错误信息明确指出使用位置要求',
    observed.caughtError?.includes('useTerminalSize must be used within an App') ?? false,
    true,
  )

  log(`\n\x1b[1m结果：\x1b[0m ${passed} 通过, ${failed} 失败\n`)
  flush()
  process.exit(failed === 0 ? 0 : 1)
}

void main()
