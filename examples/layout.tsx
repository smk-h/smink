/**
 * smink 布局示例 - 展示 Flexbox 布局能力
 *
 * 演示：
 *   - flexDirection: row / column
 *   - justifyContent / alignItems
 *   - flexGrow / gap
 *   - 边框样式
 *   - 背景色
 *   - 绝对定位
 *
 * 快捷键：Tab 切换页面，q 退出
 */

import React, { useState } from 'react'
import {
  render,
  Box,
  Text,
  Newline,
  Spacer,
  useInput,
  useApp,
} from '../src/index.js'

const C = {
  cyan: 'ansi:cyan',
  green: 'ansi:green',
  yellow: 'ansi:yellow',
  red: 'ansi:red',
  magenta: 'ansi:magenta',
  blue: 'ansi:blue',
  dim: 'ansi:blackBright',
  white: 'ansi:white',
  bg1: 'ansi256(23)',
  bg2: 'ansi256(53)',
  bg3: 'ansi256(89)',
  bg4: 'ansi256(236)',
  border: 'ansi256(60)',
}

/** 页面1：基础 Flexbox 布局 */
const Page1 = () => (
  <Box flexDirection="column" gap={1}>
    <Text color={C.cyan} bold>◆ Row 方向（水平排列）</Text>
    <Box flexDirection="row" gap={1}>
      <Box borderStyle="round" borderColor={C.cyan} paddingX={1}>
        <Text color={C.cyan}>Block A</Text>
      </Box>
      <Box borderStyle="round" borderColor={C.green} paddingX={1}>
        <Text color={C.green}>Block B</Text>
      </Box>
      <Box borderStyle="round" borderColor={C.yellow} paddingX={1}>
        <Text color={C.yellow}>Block C</Text>
      </Box>
    </Box>

    <Text color={C.green} bold>◆ Column 方向（垂直排列）</Text>
    <Box flexDirection="column" gap={0}>
      <Box backgroundColor={C.bg1} paddingX={1}>
        <Text color={C.white}>Item 1</Text>
      </Box>
      <Box backgroundColor={C.bg2} paddingX={1}>
        <Text color={C.white}>Item 2</Text>
      </Box>
      <Box backgroundColor={C.bg3} paddingX={1}>
        <Text color={C.white}>Item 3</Text>
      </Box>
    </Box>

    <Text color={C.yellow} bold>◆ justifyContent: space-between</Text>
    <Box justifyContent="space-between" borderStyle="single" borderColor={C.border} paddingX={1}>
      <Text color={C.yellow}>Left</Text>
      <Text color={C.yellow}>Center</Text>
      <Text color={C.yellow}>Right</Text>
    </Box>

    <Text color={C.red} bold>◆ Gap 间距</Text>
    <Box gap={2} borderStyle="single" borderColor={C.border} paddingX={1}>
      <Text color={C.red}>A</Text>
      <Text color={C.red}>B</Text>
      <Text color={C.red}>C</Text>
    </Box>
  </Box>
)

/** 页面2：边框样式 + 文本样式 */
const Page2 = () => (
  <Box flexDirection="column" gap={1}>
    <Text color={C.cyan} bold>◆ 边框样式</Text>
    <Box gap={1} flexDirection="column">
      {(['single', 'double', 'round', 'bold', 'singleDouble', 'doubleSingle', 'classic'] as const).map(style => (
        <Box key={style} borderStyle={style} borderColor={C.cyan} paddingX={1}>
          <Text color={C.dim}>borderStyle="{style}"</Text>
        </Box>
      ))}
    </Box>

    <Text color={C.green} bold>◆ 文本样式</Text>
    <Box flexDirection="column" gap={0}>
      <Text bold>Bold 粗体</Text>
      <Text italic>Italic 斜体</Text>
      <Text underline>Underline 下划线</Text>
      <Text strikethrough>Strikethrough 删除线</Text>
      <Text inverse>Inverse 反色</Text>
      <Text dim>Dim 暗淡</Text>
      <Text color={C.cyan}>Color: cyan</Text>
      <Text color={C.green} backgroundColor={C.bg1}>Color + Background</Text>
    </Box>
  </Box>
)

/** 页面3：FlexGrow + 绝对定位 */
const Page3 = () => (
  <Box flexDirection="column" gap={1}>
    <Text color={C.cyan} bold>◆ FlexGrow 自适应</Text>
    <Box gap={1} height={3}>
      <Box flexGrow={1} backgroundColor={C.bg1} justifyContent="center" alignItems="center">
        <Text color={C.white}>flexGrow=1</Text>
      </Box>
      <Box flexGrow={2} backgroundColor={C.bg2} justifyContent="center" alignItems="center">
        <Text color={C.white}>flexGrow=2</Text>
      </Box>
      <Box flexGrow={1} backgroundColor={C.bg3} justifyContent="center" alignItems="center">
        <Text color={C.white}>flexGrow=1</Text>
      </Box>
    </Box>

    <Text color={C.green} bold>◆ Spacer 弹性空白</Text>
    <Box borderStyle="single" borderColor={C.border} paddingX={1}>
      <Text color={C.green}>Left</Text>
      <Spacer />
      <Text color={C.yellow}>Right</Text>
    </Box>

    <Text color={C.yellow} bold>◆ 绝对定位</Text>
    <Box borderStyle="round" borderColor={C.border} height={6} padding={1}>
      <Text color={C.dim}>相对定位内容（左上角）</Text>
      <Box position="absolute" top={0} right={2}>
        <Text color={C.red}>绝对定位（右上角）</Text>
      </Box>
      <Box position="absolute" bottom={0} left={2}>
        <Text color={C.blue}>绝对定位（左下角）</Text>
      </Box>
    </Box>

    <Text color={C.magenta} bold>◆ 嵌套布局</Text>
    <Box gap={1}>
      <Box flexDirection="column" gap={1} flexGrow={1}>
        <Box backgroundColor={C.bg1} paddingX={1}>
          <Text color={C.white}>Left Top</Text>
        </Box>
        <Box backgroundColor={C.bg2} paddingX={1}>
          <Text color={C.white}>Left Bottom</Text>
        </Box>
      </Box>
      <Box backgroundColor={C.bg3} flexGrow={2} paddingX={1} justifyContent="center">
        <Text color={C.white}>Right (flexGrow=2)</Text>
      </Box>
    </Box>
  </Box>
)

// ─── 主应用 ──────────────────────────────────────

const PAGES = [
  { name: 'Flexbox 布局', component: Page1 },
  { name: '边框 & 文本', component: Page2 },
  { name: '高级布局', component: Page3 },
]

const App = () => {
  const { exit } = useApp()
  const [page, setPage] = useState(0)

  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit()
      return
    }
    if (key.tab) {
      setPage(p => (p + 1) % PAGES.length)
    }
  })

  const PageComponent = PAGES[page].component

  return (
    <Box flexDirection="column" padding={1}>
      {/* 标签栏 */}
      <Box gap={1} marginBottom={1}>
        {PAGES.map((p, i) => (
          <Box key={i} paddingX={1}>
            <Text
              color={i === page ? C.cyan : C.dim}
              bold={i === page}
              underline={i === page}
            >
              {i === page ? '▸ ' : '  '}{p.name}
            </Text>
          </Box>
        ))}
        <Spacer />
        <Text color={C.dim}>Tab 切换 │ q 退出</Text>
      </Box>

      {/* 分隔线 */}
      <Box borderStyle="single" borderColor={C.border} marginBottom={1} />

      {/* 内容区 */}
      <PageComponent />
    </Box>
  )
}

render(<App />)
