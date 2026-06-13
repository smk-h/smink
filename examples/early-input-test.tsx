/**
 * Early Input 测试
 *
 * 测试方式：运行后立即开始打字，观察启动后是否捕获到预输入
 * 
 * 用法:
 *   npx tsx examples/early-input-test.tsx                  # 手动输入测试
 *   npx tsx examples/early-input-test.tsx --seed "hello"   # 自动注入预输入
 * 
 * 测试步骤：
 * 1. 运行命令后立即快速输入一些文字（不用等界面出现）
 * 2. 等待 2 秒后界面渲染，观察是否显示了你输入的内容
 * 3. 加 --seed 参数可自动注入预输入文本，无需手动打字
 */

import React from 'react'
import {
  render,
  Box,
  Text,
  useInput,
  useApp,
} from '../src/index.js'
import {
  startCapturingEarlyInput,
  consumeEarlyInput,
  hasEarlyInput,
  seedEarlyInput,
  isCapturingEarlyInput,
} from '../src/utils/earlyInput.js'

// 1. 尽早开始捕获 —— 模拟真实应用中在 cli.tsx 入口处调用
startCapturingEarlyInput()

// 2. 解析 --seed 参数，自动注入预输入文本（无需手动打字）
const seedIdx = process.argv.indexOf('--seed')
if (seedIdx !== -1) {
  const seedArgs = process.argv.slice(seedIdx + 1)
  // 第一个参数如果以引号开头，说明 shell 没有正确解析，尝试拼接后续参数
  // 否则直接取第一个参数（shell 正确解析了带空格的字符串）
  if (seedArgs.length > 0) {
    const first = seedArgs[0]!
    if (first.startsWith("'") || first.startsWith('"')) {
      // Shell 未正确解析引号，拼接所有参数并去除首尾引号
      const raw = seedArgs.join(' ')
      seedEarlyInput(raw.slice(1, raw.endsWith("'") || raw.endsWith('"') ? -1 : undefined))
    } else {
      seedEarlyInput(first)
    }
  }
}

function TestApp() {
  const { exit } = useApp()
  const [earlyInput, setEarlyInput] = React.useState<string | null>(null)
  const [currentInput, setCurrentInput] = React.useState('')
  const [phase, setPhase] = React.useState<'loading' | 'ready'>('loading')

  // 模拟启动延迟
  React.useEffect(() => {
    const timer = setTimeout(() => {
      // 2. 启动完成后消费预输入
      const captured = consumeEarlyInput()
      setEarlyInput(captured || null)
      setPhase('ready')
    }, 2000)

    return () => clearTimeout(timer)
  }, [])

  useInput((input, key) => {
    if (key.escape) {
      exit()
      return
    }
    if (key.return) {
      exit()
      return
    }
    if (key.backspace) {
      setCurrentInput(prev => prev.slice(0, -1))
      return
    }
    setCurrentInput(prev => prev + input)
  })

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="green">Early Input 测试</Text>
      <Text dimColor>────────────────────────────</Text>

      <Box marginTop={1}>
        <Text color="yellow">状态: </Text>
        <Text color={phase === 'ready' ? 'green' : 'red'}>
          {phase === 'loading' ? '⏳ 加载中 (2秒)...' : '✅ 就绪'}
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text color="yellow">捕获状态: </Text>
        <Text>{isCapturingEarlyInput() ? '正在捕获' : '已停止'}</Text>
      </Box>

      {earlyInput !== null && (
        <Box marginTop={1} flexDirection="column">
          <Text color="cyan" bold>✓ 捕获到预输入:</Text>
          <Box marginLeft={2} borderStyle="round" borderColor="cyan" paddingX={1}>
            <Text color="cyan">{earlyInput}</Text>
          </Box>
        </Box>
      )}

      {earlyInput === null && phase === 'ready' && (
        <Box marginTop={1}>
          <Text dimColor>✗ 没有捕获到预输入 (启动前没输入任何内容)</Text>
        </Box>
      )}

      {phase === 'ready' && (
        <Box marginTop={1} flexDirection="column">
          <Text color="yellow">当前输入 (ESC/Enter 退出):</Text>
          <Box marginLeft={2}>
            <Text>{currentInput}</Text>
            <Text backgroundColor="white" color="black">▌</Text>
          </Box>
        </Box>
      )}

      {phase === 'loading' && (
        <Box marginTop={1}>
          <Text dimColor>💡 提示: 现在快速输入一些文字试试!</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>────────────────────────────</Text>
      </Box>
      <Text dimColor>hasEarlyInput: {String(hasEarlyInput())} | seedEarlyInput() 可在代码中预填文本</Text>
    </Box>
  )
}

render(<TestApp />)
