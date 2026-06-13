# @smai-kit/smink

一个基于 React 的独立终端 UI 框架，提取自 [Claude Code](https://github.com/anthropics/claude-code) 深度定制的 [Ink](https://github.com/vadimdemedes/ink) 运行时。

## 特性

- **基于 React**：使用 React 组件和 Hooks 构建终端界面
- **Concurrent Mode**：利用 React 19 的 `ConcurrentRoot` 实现异步渲染
- **纯 TypeScript Yoga**：Flexbox 布局引擎移植为纯 TypeScript 实现（无原生/WASM 依赖）
- **双缓冲差分渲染**：基于差异的屏幕更新，最大程度减少闪烁
- **丰富终端支持**：鼠标追踪、文本选择、滚动、Alt-Screen
- **Kitty 键盘协议**：现代终端的扩展按键支持
- **CSI/DEC/OSC 转义序列**：完整的终端协议处理

## 安装

```bash
npm install smink react react-reconciler
```

## 快速开始

```tsx
import React, { useState } from 'react'
import { render, Box, Text, useInput } from 'smink'

const App = () => {
  const [count, setCount] = useState(0)

  useInput((input, key) => {
    if (key.upArrow) setCount(c => c + 1)
    if (key.downArrow) setCount(c => c - 1)
    if (key.escape) process.exit(0)
  })

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="ansi:green">smink 计数器</Text>
      <Text>计数: {count}</Text>
      <Text color="ansi:blackBright">↑/↓ 调整 · Esc 退出</Text>
    </Box>
  )
}

render(<App />)
```

## API

### 渲染

- `render(node)` — 挂载并渲染 React 树
- `createRoot(options)` — 创建可复用的根实例（类似 `react-dom.createRoot`）
- `renderSync(node, options)` — 同步渲染

### 组件

| 组件 | 说明 |
|------|------|
| `Box` | Flexbox 容器 |
| `Text` | 带样式的文本渲染 |
| `Button` | 可交互按钮（支持焦点/悬停/激活状态） |
| `Newline` | 换行 |
| `Spacer` | 弹性空白填充 |
| `Link` | 终端超链接（OSC 8） |
| `ScrollBox` | 可滚动容器（自动粘底、视口裁剪） |
| `AlternateScreen` | 切换至 Alt-Screen 缓冲区 |
| `NoSelect` | 禁止文本选择 |
| `RawAnsi` | 原始 ANSI 输出（绕过解析流程） |
| `Ansi` | 解析 ANSI 文本 |

### Hooks

| Hook | 说明 |
|------|------|
| `useInput(handler)` | 键盘输入处理 |
| `useApp()` | 应用控制（退出等） |
| `useStdin()` | 标准输入访问 |
| `useTerminalViewport()` | 终端视口检测（元素是否可见） |
| `useTerminalFocus()` | 终端焦点状态（聚焦/失焦） |
| `useTerminalTitle()` | 终端标题设置 |
| `useSelection()` | 文本选择交互 |
| `useAnimationFrame(callback)` | 动画帧（共享时钟驱动） |
| `useInterval(callback, ms)` | 间隔定时器（共享时钟驱动） |
| `useTabStatus(text)` | 终端标签页状态 |
| `useSearchHighlight()` | 搜索高亮 |
| `useDeclaredCursor()` | 声明式光标位置 |

## 示例

项目包含四个示例，可直接运行：

```bash
# 最简示例 - Hello World
npm run hello

# 布局展示 - Flexbox、边框、文本样式
npm run layout

# 综合示例 - Todo 应用（增删改、滚动、状态栏）
npm run demo

# AI 聊天 - 与大模型流式交互
npm run chat
```

### Hello World (`examples/hello.tsx`)

最简单的 smink 应用，展示 `render`、`Box`、`Text`、`useInput` 基本用法。

### Layout (`examples/layout.tsx`)

分页展示布局能力：
- Flexbox row/column、justifyContent、gap
- 7 种边框样式、文本样式（粗体/斜体/下划线/删除线等）
- FlexGrow、Spacer、绝对定位

快捷键：Tab 切换页面，q 退出。

### Todo Demo (`examples/demo.tsx`)

完整的 Todo 应用，展示：
- `useInput` 键盘交互（j/k 上下移动、a 添加、d 删除、空格切换状态）
- `ScrollBox` 可滚动列表
- 动态输入框
- 状态栏与进度条
- `useApp` 退出控制

快捷键：a 添加、d 删除、空格 完成、↑↓/jk 移动、q 退出。

### AI Chat (`examples/chat.tsx`)

与大模型（DeepSeek）交互的终端聊天界面：

```bash
# 先配置 .env 文件中的 DEEPSEEK_API_KEY
npm run chat
```

功能：
- 输入框固定在终端底部
- 流式显示 AI 回复（逐字输出）
- 思维链（reasoning_content）折叠显示
- 自动滚动到最新消息
- 完整对话历史上下文

快捷键：Enter 发送、Ctrl+L 清空、Ctrl+C 退出。

### Early Input Test (`examples/early-input-test.tsx`)

预输入捕获功能测试：

```bash
# 手动测试 — 运行后快速打字，观察是否被捕获
npm run test:early

# 自动注入测试 — 自动 seed 预输入文本
npm run test:early:seed
```

展示 `utils/earlyInput.ts` 的完整工作流程：`startCapturingEarlyInput()` → `consumeEarlyInput()` → 在界面显示捕获内容。

## 项目结构

```
smink/
├── src/
│   ├── index.ts              # 主入口，导出所有公共 API
│   ├── ink/                  # 核心 Ink 框架（深度定制版）
│   │   ├── ink.tsx           # 主渲染循环、事件调度（246KB）
│   │   ├── root.ts           # createRoot / render API
│   │   ├── reconciler.ts     # React Reconciler（ConcurrentRoot）
│   │   ├── screen.ts         # 双缓冲屏幕（48KB）
│   │   ├── terminal.ts       # 终端 I/O 抽象层
│   │   ├── selection.ts      # 鼠标文本选择系统（34KB）
│   │   ├── searchHighlight.ts # 搜索高亮
│   │   ├── render-node-to-output.ts  # 渲染节点到输出（62KB）
│   │   ├── render-border.ts  # 边框渲染
│   │   ├── colorize.ts       # 颜色处理
│   │   ├── wrap-text.ts      # 文本换行
│   │   ├── stringWidth.ts    # 字符宽度计算（CJK/Emoji）
│   │   ├── wrapAnsi.ts       # ANSI 换行
│   │   ├── focus.ts          # 焦点管理器
│   │   ├── layout/           # Yoga 布局桥接层
│   │   ├── components/       # 组件：Box, Text, Button, ScrollBox 等
│   │   ├── hooks/            # Hooks：useInput, useApp, useSelection 等
│   │   ├── events/           # 事件系统
│   │   └── termio/           # 终端协议处理
│   │       ├── csi.ts        # CSI 序列解析
│   │       ├── dec.ts        # DEC 私有模式
│   │       ├── osc.ts        # OSC 序列处理
│   │       ├── mouse.ts      # SGR 鼠标追踪
│   │       └── kitty.ts      # Kitty 键盘协议
│   ├── native-ts/
│   │   └── yoga-layout/      # 纯 TS Yoga 引擎（81KB，无原生依赖）
│   ├── utils/                # 工具函数（见下方详细说明）
│   └── bootstrap/            # 启动状态管理（见下方详细说明）
├── examples/                 # 示例程序
│   ├── hello.tsx             # Hello World
│   ├── layout.tsx            # 布局展示
│   ├── demo.tsx              # Todo 应用
│   ├── chat.tsx              # AI 聊天
│   └── early-input-test.tsx  # 预输入捕获测试
├── package.json
└── tsconfig.json
```

## 工具模块

smink 提取自 Claude Code 的完整应用源码，其中 `utils/` 和 `bootstrap/` 包含了 TUI 运行所必需的基础设施。

### `bootstrap/state.ts` — 启动状态管理

管理 TUI 运行时的全局状态，提供交互时间追踪和滚动防抖机制：

```ts
import {
  // 交互时间追踪
  flushInteractionTime,       // Ink 每帧渲染前调用，批量刷新 Date.now()
  updateLastInteractionTime,  // 标记用户交互（默认延迟到下帧刷新）
  getLastInteractionTime,     // 获取最后交互时间戳

  // 滚动防抖
  markScrollActivity,        // ScrollBox 滚动时调用，设置 150ms 防抖标志
  getIsScrollDraining,       // 查询是否在滚动防抖期内
  waitForScrollIdle,         // 异步等待滚动结束（后台任务使用）

  // 交互模式
  getIsInteractive,          // 是否交互模式（stdin.isTTY）
  getIsNonInteractiveSession, // 是否非交互模式
  setIsInteractive,          // 运行时覆盖交互模式
} from 'smink/bootstrap/state.js'
```

**交互时间批量刷新**：`updateLastInteractionTime()` 默认只设置脏标记，`flushInteractionTime()` 在 Ink 每帧渲染前批量刷新为一次 `Date.now()` 调用，避免每次按键都调用 `Date.now()`。传入 `{ immediate: true }` 可立即刷新（适用于 `useEffect` 等渲染后回调）。

**滚动防抖**：`markScrollActivity()` 设置 150ms 防抖标志，后台定时器检查 `getIsScrollDraining()` 后自动跳过工作，避免和滚动帧争抢事件循环。重操作前可 `await waitForScrollIdle()` 等待滚动结束。

### `utils/earlyInput.ts` — 预输入捕获

捕获 TUI 启动前用户敲入的按键，避免丢失早期输入：

```ts
import {
  startCapturingEarlyInput,  // 尽早调用，开启 stdin raw mode 监听
  consumeEarlyInput,         // TUI 就绪后消费缓冲区内容
  hasEarlyInput,              // 检查是否有预输入
  seedEarlyInput,             // 手动注入预输入文本
  isCapturingEarlyInput,      // 查询是否正在捕获
} from 'smink/utils/earlyInput.js'
```

**使用模式**：

```ts
// 1. 应用入口处尽早调用（cli.tsx 最顶部）
startCapturingEarlyInput()

// 2. ... 执行启动逻辑 ...

// 3. TUI 就绪后消费预输入
const earlyText = consumeEarlyInput()
if (earlyText) {
  // 将预输入作为初始输入使用
}
```

**按键处理**：完整支持 Ctrl+C（退出）、Ctrl+D（停止捕获）、Backspace（按 grapheme 删除）、ESC 序列跳过（箭头键等）、CR→LF 转换。

**测试**：

```bash
# 手动测试 — 运行后快速打字
npm run test:early

# 自动注入测试 — 无需手动打字
npm run test:early:seed
```

### `utils/env.ts` — 环境检测

提供跨平台的运行环境信息：

```ts
import { env } from 'smink/utils/env.js'

env.isCI       // 是否 CI 环境
env.platform   // 'win32' | 'darwin' | 'linux'
env.arch       // CPU 架构
env.nodeVersion // Node 版本
env.terminal   // 终端类型检测
```

### `utils/envUtils.ts` — 环境变量工具

```ts
import { isEnvTruthy } from 'smink/utils/envUtils.js'

isEnvTruthy(process.env.SOME_FLAG)  // '1'|'true'|'yes'|'on' → true
```

### `utils/intl.ts` — Unicode 文本处理

基于 `Intl.Segmenter` 的字形和分词处理：

```ts
import { firstGrapheme, lastGrapheme } from 'smink/utils/intl.js'

lastGrapheme('你好👋')  // '👋' — 正确处理 Emoji 字形簇
firstGrapheme('abc')   // 'a'
```

---

## 与官方 Ink 的详细对比

Claude Code 对 Ink 进行了**大规模深度重写**。核心 `ink.tsx` 从官方的约 200 行膨胀到约 5000+ 行（246KB），几乎每个模块都有根本性改造。以下按模块逐一对比：

### 1. 渲染引擎

| 特性 | 官方 Ink | smink（Claude 定制版） |
|------|---------|----------------------|
| 渲染方式 | 全量重绘，每帧输出完整内容 | **双缓冲差分渲染**，只输出变化的 cell |
| 屏幕缓冲 | 无 | `screen.ts`（48KB）维护前/后双缓冲区，cell 池化复用 |
| 渲染管线 | React → Yoga → 序列化 → 输出 | React → Yoga → **render-node-to-output**（62KB）→ 差分计算 → 最小化输出 |
| 闪烁 | 全量重绘容易闪烁 | 差分渲染最大程度减少闪烁 |
| 性能优化 | 无 | 视口裁剪（ScrollBox 内只渲染可见元素）、cell 对象池、跳过不变行 |

### 2. 布局引擎

| 特性 | 官方 Ink | smink |
|------|---------|-------|
| Yoga 引擎 | `yoga-layout-prebuilt`（WASM / 原生 Node addon） | **纯 TypeScript 移植**（`native-ts/yoga-layout/`，81KB） |
| 安装依赖 | 需要 native 编译环境 | 零原生依赖，纯 JS |
| 跨平台 | Windows/ARM 可能编译失败 | 任何支持 JS 的平台均可运行 |
| 性能 | WASM 较快 | 纯 JS 略慢，但消除编译问题 |

### 3. 终端 I/O

| 特性 | 官方 Ink | smink |
|------|---------|-------|
| 输入处理 | 基本的 raw stdin 读取 | **完整的终端协议栈**（`termio/`） |
| 键盘协议 | 基本的 `key.leftArrow` 等 | **Kitty 键盘协议**（`termio/kitty.ts`），支持 modifyOtherKeys、完整修饰键组合 |
| 鼠标追踪 | 无 | **SGR 鼠标追踪**（`termio/mouse.ts`），支持 mode 1002/1003/1006 |
| 转义序列 | 无 | **CSI**（`csi.ts`）、**DEC**（`dec.ts`）、**OSC**（`osc.ts`）完整解析 |
| Alt-Screen | 无 | **DEC 1049** Alt-Screen 缓冲区切换（`AlternateScreen` 组件） |
| 终端焦点 | 无 | **DECSET 1004** 终端焦点事件（`useTerminalFocus`） |
| 标签状态 | 无 | **OSC 标签状态** 查询与设置（`useTabStatus`） |
| 括号粘贴 | 无 | **括号粘贴模式** 检测（区分粘贴和逐字输入） |
| 终端版本探测 | 无 | **XTVERSION** 探测终端类型 |

### 4. 文本选择

| 特性 | 官方 Ink | smink |
|------|---------|-------|
| 鼠标选择 | 无 | **完整的鼠标文本选择系统**（`selection.ts`，34KB） |
| 选择模式 | 无 | 字符模式、词模式（双击）、行模式（三击） |
| 剪贴板 | 无 | 选择内容自动复制到剪贴板 |
| 跨行选择 | 无 | 支持跨行、跨滚动区域选择 |
| 禁止选择 | 无 | `NoSelect` 组件标记不可选择区域 |
| 选择 Hook | 无 | `useSelection` Hook |

### 5. 滚动系统

| 特性 | 官方 Ink | smink |
|------|---------|-------|
| 可滚动容器 | 无 | **`ScrollBox`**（31KB），功能完备的滚动容器 |
| 粘底滚动 | 无 | `stickyScroll` 自动跟随新内容 |
| 视口裁剪 | 无 | 只渲染可见区域内的元素 |
| 命令式 API | 无 | `scrollTo`、`scrollBy`、`scrollToBottom`、`scrollToElement` |
| 滚动区域优化 | 无 | DECSTBM 设置滚动区域 |
| 鼠标滚轮 | 无 | 支持鼠标滚轮平滑滚动 |

### 6. 搜索高亮

| 特性 | 官方 Ink | smink |
|------|---------|-------|
| 终端内搜索 | 无 | **`searchHighlight.ts`** 支持搜索文本高亮 |
| 搜索 Hook | 无 | `useSearchHighlight` |

### 7. 新增组件

| 组件 | 官方 Ink | smink | 说明 |
|------|---------|-------|------|
| `ScrollBox` | ❌ | ✅ | 可滚动容器，粘底、视口裁剪 |
| `AlternateScreen` | ❌ | ✅ | Alt-Screen 缓冲区，SGR 鼠标追踪 |
| `NoSelect` | ❌ | ✅ | 禁止文本选择 |
| `RawAnsi` | ❌ | ✅ | 原始 ANSI 输出，绕过解析流程 |
| `Ansi` | ❌ | ✅ | 解析 ANSI 文本渲染 |
| `Button` | 简单 | ✅ 深度增强 | 焦点/悬停/激活状态、Tab 导航、渲染属性 |
| `Link` | ❌ | ✅ | OSC 8 终端超链接 |
| `ClockProvider` | ❌ | ✅ | 共享动画时钟 |
| `TerminalFocusContext` | ❌ | ✅ | 终端焦点状态上下文 |

### 8. 新增 Hooks

| Hook | 官方 Ink | smink | 说明 |
|------|---------|-------|------|
| `useSelection` | ❌ | ✅ | 文本选择交互 |
| `useSearchHighlight` | ❌ | ✅ | 搜索高亮 |
| `useDeclaredCursor` | ❌ | ✅ | 声明式光标位置 |
| `useTabStatus` | ❌ | ✅ | 终端标签页状态 |
| `useTerminalFocus` | ❌ | ✅ | 终端焦点状态 |
| `useTerminalTitle` | ❌ | ✅ | 终端标题设置 |
| `useTerminalViewport` | ❌ | ✅ | 元素可见性检测 |
| `useAnimationFrame` | ❌ | ✅ | 共享时钟驱动的动画帧 |
| `useInterval` | ❌ | ✅ | 共享时钟驱动的间隔定时器 |

### 9. 事件系统

| 事件 | 官方 Ink | smink |
|------|---------|-------|
| `InputEvent` | 基本按键 | ✅ 增强版，Kitty 协议支持 |
| `ClickEvent` | ❌ | ✅ 鼠标点击事件（含坐标、按钮、修饰键） |
| `TerminalFocusEvent` | ❌ | ✅ 终端焦点变化事件 |
| `KeyboardEvent` | ❌ | ✅ 增强的键盘事件（修饰键、按键码） |
| `FocusEvent` | ❌ | ✅ 元素焦点变化 |
| 鼠标悬停 | ❌ | ✅ `onMouseEnter` / `onMouseLeave` |

### 10. Box 组件增强

| 属性 | 官方 Ink | smink |
|------|---------|-------|
| `tabIndex` | ❌ | ✅ Tab 导航顺序 |
| `autoFocus` | ❌ | ✅ 自动聚焦 |
| `onClick` | ❌ | ✅ 鼠标点击事件 |
| `onFocus` / `onBlur` | ❌ | ✅ 焦点事件 |
| `onKeyDown` | ❌ | ✅ 键盘事件 |
| `onMouseEnter` / `onMouseLeave` | ❌ | ✅ 鼠标悬停 |
| `noSelect` | ❌ | ✅ 禁止选择 |

### 11. Reconciler 改造

| 特性 | 官方 Ink | smink |
|------|---------|-------|
| React 模式 | Legacy Root | **ConcurrentRoot**（React 19） |
| 焦点管理 | 无 | **FocusManager** 集成，`commitMount` 时自动聚焦 |
| 滚动感知 | 无 | Reconciler 感知滚动活动，优化调度 |
| 脏标记 | 无 | `markDirty` / `markCommitStart` / `scheduleRenderFrom` |

### 12. App 根组件改造

官方 Ink 的 `App` 组件仅处理 stdin + Ctrl+C（约 50 行），smink 的 `App` 扩展到约 2500+ 行（96KB），新增：

- Kitty 键盘解析 + modifyOtherKeys
- SGR 鼠标事件分发
- 文本选择编排（开始/更新/完成/词/行模式）
- 点击事件冒泡
- 悬停追踪（`onMouseEnter`/`onMouseLeave`）
- 多击检测（双击/三击）
- 括号粘贴检测
- 终端焦点事件
- 光标声明
- XTVERSION 探测
- stdin 恢复间隙检测

### 13. 文本处理增强

| 特性 | 官方 Ink | smink |
|------|---------|-------|
| `stringWidth` | 依赖第三方包 | 内置实现，支持 **Bun.stringWidth** 加速 |
| `wrapAnsi` | 依赖第三方包 | 内置实现，支持 **Bun.wrapAnsi** 加速 |
| 双向文本 | 无 | **bidi-js** 集成，支持阿拉伯语/希伯来语 |
| Emoji 宽度 | 基本支持 | **emoji-regex** + **get-east-asian-width** 增强处理 |

### 14. 错误展示

| 特性 | 官方 Ink | smink |
|------|---------|-------|
| 错误边界 | 基本的 ErrorBoundary | **ErrorOverview** 组件，带代码摘录、文件路径清理、堆栈解析 |

---

## 总结

| 维度 | 官方 Ink | smink（Claude 定制版） |
|------|---------|----------------------|
| 核心代码量 | ~3,000 行 | ~23,000 行 |
| 渲染方式 | 全量重绘 | 双缓冲差分渲染 |
| 布局引擎 | WASM / 原生 addon | 纯 TypeScript |
| 鼠标支持 | 无 | 完整（追踪、选择、点击、悬停） |
| 滚动 | 无 | ScrollBox（粘底、视口裁剪） |
| Alt-Screen | 无 | 完整支持 |
| 键盘协议 | 基本按键 | Kitty 协议 + 修饰键 |
| 终端协议 | 无 | CSI/DEC/OSC 完整栈 |
| React 版本 | Legacy Root | ConcurrentRoot（React 19） |
| 文本选择 | 无 | 完整（字符/词/行模式 + 剪贴板） |
| 搜索高亮 | 无 | 支持 |
| 焦点管理 | 无 | FocusManager + Tab 导航 |

**一句话概括**：Claude Code 把 Ink 从一个"终端里的 React 渲染器"改造成了"终端 GUI 框架"，补齐了鼠标、选择、滚动、Alt-Screen 等现代 GUI 应用的基础能力。

## 许可证

MIT

