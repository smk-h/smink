<!-- more -->

## 一、 项目简介

smink 是一个基于 React 的独立终端 UI 框架，提取自 [Claude Code](https://github.com/anthropics/claude-code) 深度定制的 [Ink](https://github.com/vadimdemedes/ink) 运行时。

- **基于 React**：使用 React 组件和 Hooks 构建终端界面
- **Concurrent Mode**：利用 React 19 的 `ConcurrentRoot` 实现异步渲染
- **纯 TypeScript Yoga**：Flexbox 布局引擎移植为纯 TypeScript 实现（无原生/WASM 依赖）
- **双缓冲差分渲染**：基于差异的屏幕更新，最大程度减少闪烁
- **丰富终端支持**：鼠标追踪、文本选择、滚动、Alt-Screen
- **Kitty 键盘协议**：现代终端的扩展按键支持
- **CSI/DEC/OSC 转义序列**：完整的终端协议处理

## 二、 安装

```bash
npm install smink react react-reconciler
```

## 三、 快速开始

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

## 四、 API

### 1. 渲染

- `render(node)` — 挂载并渲染 React 树
- `createRoot(options)` — 创建可复用的根实例（类似 `react-dom.createRoot`）
- `renderSync(node, options)` — 同步渲染

### 2. 组件

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

### 3. Hooks

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

## 五、 示例

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

### 1. Hello World (`examples/hello.tsx`)

最简单的 smink 应用，展示 `render`、`Box`、`Text`、`useInput` 基本用法。

### 2. Layout (`examples/layout.tsx`)

分页展示布局能力：
- Flexbox row/column、justifyContent、gap
- 7 种边框样式、文本样式（粗体/斜体/下划线/删除线等）
- FlexGrow、Spacer、绝对定位

快捷键：Tab 切换页面，q 退出。

### 3. Todo Demo (`examples/demo.tsx`)

完整的 Todo 应用，展示：
- `useInput` 键盘交互（j/k 上下移动、a 添加、d 删除、空格切换状态）
- `ScrollBox` 可滚动列表
- 动态输入框
- 状态栏与进度条
- `useApp` 退出控制

快捷键：a 添加、d 删除、空格 完成、↑↓/jk 移动、q 退出。

### 4. AI Chat (`examples/chat.tsx`)

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

### 5. Early Input Test (`examples/early-input-test.tsx`)

预输入捕获功能测试：

```bash
# 手动测试 — 运行后快速打字，观察是否被捕获
npm run test:early

# 自动注入测试 — 自动 seed 预输入文本
npm run test:early:seed
```

展示 `utils/earlyInput.ts` 的完整工作流程：`startCapturingEarlyInput()` → `consumeEarlyInput()` → 在界面显示捕获内容。

## 六、 项目结构

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

## 七、 工具模块

smink 提取自 Claude Code 的完整应用源码，其中 `utils/` 和 `bootstrap/` 包含了 TUI 运行所必需的基础设施。

### 1. `bootstrap/state.ts` — 启动状态管理

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

### 2. `utils/earlyInput.ts` — 预输入捕获

捕获 TUI 启动前用户敲入的按键，避免丢失早期输入：

```ts
import {
  startCapturingEarlyInput,  // 尽早调用，开启 stdin raw mode 监听
  consumeEarlyInput,         // TUI 就绪后消费缓冲区内容
  hasEarlyInput,             // 检查是否有预输入
  seedEarlyInput,            // 手动注入预输入文本
  isCapturingEarlyInput,     // 查询是否正在捕获
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

### 3. `utils/env.ts` — 环境检测

提供跨平台的运行环境信息，支持 30+ 种终端检测：

```ts
import { env, JETBRAINS_IDES } from 'smink/utils/env.js'

env.isCI            // 是否 CI 环境
env.platform        // 'win32' | 'darwin' | 'linux'
env.arch            // CPU 架构
env.nodeVersion     // Node 版本
env.terminal        // 终端类型检测（30+ 种）
env.isSSH()         // 是否 SSH 会话
env.isWslEnvironment()  // 是否 WSL 环境
```

**终端检测覆盖**：Cursor、Windsurf、JetBrains 全系列 IDE（16 种）、Ghostty、kitty、iTerm2、WezTerm、Alacritty、tmux、screen、Konsole、GNOME Terminal、VTE 系、Windows Terminal、ConEmu、WSL、SSH session 等。

### 4. `utils/envUtils.ts` — 环境变量工具

```ts
import { isEnvTruthy } from 'smink/utils/envUtils.js'

isEnvTruthy(process.env.SOME_FLAG)  // '1'|'true'|'yes'|'on' → true
```

### 5. `utils/intl.ts` — Unicode 文本处理

基于 `Intl.Segmenter` 的字形、分词和国际化处理：

```ts
import {
  firstGrapheme,           // 提取首字形簇
  lastGrapheme,            // 提取末字形簇
  getWordSegmenter,        // 分词器
  getRelativeTimeFormat,   // 相对时间格式化
  getTimeZone,             // 系统时区
  getSystemLocaleLanguage, // 系统语言子标签
} from 'smink/utils/intl.js'

lastGrapheme('你好👋')  // '👋' — 正确处理 Emoji 字形簇
firstGrapheme('abc')   // 'a'
getRelativeTimeFormat('long', 'auto').format(-3, 'minute')  // '3 minutes ago'
getTimeZone()          // 'Asia/Shanghai'
getSystemLocaleLanguage()  // 'zh'
```

### 6. `utils/debug.ts` — 调试日志系统

5 级日志过滤 + stderr/文件输出的调试系统：

```ts
import {
  logForDebugging,       // 输出调试日志
  isDebugMode,           // 检查调试模式是否激活
  enableDebugLogging,    // 运行时启用调试
  isDebugToStdErr,       // 是否输出到 stderr
  getDebugFilePath,      // 自定义调试文件路径
  getDebugLogPath,       // 调试日志文件路径
  getMinDebugLogLevel,   // 最低日志级别
  flushDebugLogs,        // 刷新缓冲（同步写入时为 no-op）
} from 'smink/utils/debug.js'
```

**调试模式检测**：`--debug`、`-d`、`DEBUG` 环境变量、`--debug-to-stderr`、`-d2e`、`--debug-file=path`。

**环境变量**：`SMINK_DEBUG_LOG_LEVEL`（日志级别）、`SMINK_DEBUG_LOGS_DIR`（日志目录，默认 `~/.smink/debug/`）。

### 7. `utils/log.ts` — 错误日志系统

带 sink 机制的错误日志系统：

```ts
import {
  logError,               // 记录错误
  attachErrorLogSink,     // 附加错误日志 sink
  getInMemoryErrors,      // 获取内存中的错误记录（最近 100 条）
} from 'smink/utils/log.js'
```

### 8. `utils/fullscreen.ts` — 全屏模式管理

tmux/iTerm2 兼容的全屏终端模式管理：

```ts
import {
  enterFullscreen,        // 进入全屏模式
  exitFullscreen,        // 退出全屏模式
  isTmuxControlMode,     // 是否 tmux -CC 模式
} from 'smink/utils/fullscreen.js'
```

### 9. `utils/execFileNoThrow.ts` — 子进程执行

基于 execa 的子进程执行封装，永不抛出异常：

```ts
import {
  execFileNoThrow,           // 执行命令（自动处理 cwd）
  execFileNoThrowWithCwd,    // 执行命令（指定 cwd）
} from 'smink/utils/execFileNoThrow.js'

const { stdout, stderr, code } = await execFileNoThrow('git', ['status'], {
  timeout: 60000,              // 超时（默认 10 分钟）
  abortSignal,                 // AbortSignal 支持
  preserveOutputOnError: true, // 错误时保留输出
  input: 'some input',         // stdin 输入
  env: process.env,            // 环境变量
})
```

### 10. `utils/semver.ts` — 版本比较

```ts
import { coerce, gte, satisfies } from 'smink/utils/semver.js'

gte('1.2.3', '1.0.0')  // true
```

### 11. React Compiler 存根方案

smink 的组件源码中包含 `import { c as _c } from "react/compiler-runtime"` 调用，这与 Claude Code 源码完全一致。但在运行时，smink 通过 `tsconfig.json` 的 `paths` 映射将 `react/compiler-runtime` 解析到本地存根 `src/ink/compiler-runtime-stub.ts`：

```ts
// tsconfig.json
"paths": {
  "react/compiler-runtime": ["./src/ink/compiler-runtime-stub"]
}

// compiler-runtime-stub.ts
export function c(_size: number): (value: any) => any {
  return (value: any) => value  // 透传，不做缓存
}
```

**为什么使用存根而非真正的 React Compiler：**

- React Compiler 在**编译时**将 `_c()` 缓存分配器注入组件代码，`react/compiler-runtime` 是其运行时支持包，只在经过 Compiler 编译后才可解析
- smink 的组件中的 `_c()` 调用是 Claude Code 编译后的残留，如果 smink 自己再跑一次 Compiler 会导致**二次编译**冲突
- 存根的 `_c()` 返回恒等函数 `(value) => value`，功能上**完全等价**——只是不做自动 memoization

**为什么不需要升级到真正的 React Compiler：**

1. **收益极低** — React Compiler 的核心价值是自动 memoization 减少重渲染，但终端 UI 组件树简单且浅，Ink 已自带双缓冲差分渲染优化，Compiler 带来的性能提升可忽略
2. **构建复杂度大增** — 当前构建只需 `tsc`，加入 Compiler 需要 `babel-plugin-react-compiler` + 完整构建管线，开发时 `npx tsx` 直接运行也会失效
3. **源码已对齐** — import 语句与 Claude Code 完全一致，将来如果确实需要，只需安装 Compiler + 移除 paths 映射即可切换，零代码改动

**总结**：存根是功能正确的降级方案，在保持源码与上游一致的前提下，避免了不必要的构建依赖。

## 八、 与 Claude Code 源码的差异

smink 从 Claude Code 提取并独立运行，与原版存在一些有意或无意的差异。以下按模块列出当前差异及其影响。

### 1. `ink/` 核心差异

#### 1.1 Bun 全局变量引用方式（2 个文件）

| 文件 | smink | Claude Code | 影响 |
|------|-------|-------------|------|
| [`ink/wrapAnsi.ts`](src/ink/wrapAnsi.ts) | `_globalThis.Bun`（安全防护） | 裸 `Bun` 引用 | 非 Bun 环境下原版会 `ReferenceError` |
| [`ink/stringWidth.ts`](src/ink/stringWidth.ts) | `_globalThis.Bun`（安全防护） | 裸 `Bun` 引用 | 同上 |

smink 通过 `const _globalThis = typeof globalThis !== 'undefined' ? globalThis : ...` 避免了非 Bun 运行时的崩溃。**建议保留 smink 写法**。

#### 1.2 `ink/ink.tsx` — 环境判断方式

| 位置 | smink | Claude Code |
|------|-------|-------------|
| line 269 | `if (process.env.NODE_ENV === 'development')` | `if ("production" === 'development')` |

原版通过构建工具在打包时将 `"production"` 替换为实际环境值；smink 用运行时检查。**功能等价**，保持现状即可。

#### 1.3 `ink/sliceAnsi.ts` — 类型断言

smink 使用类型窄化（`token.type === 'char'`）替代 Claude Code 的 `as any` 类型断言，更安全。**无运行时影响**。

#### 1.4 smink 独有的适配文件

| 文件 | 用途 |
|------|------|
| [`ink/compiler-runtime-stub.ts`](src/ink/compiler-runtime-stub.ts) | React Compiler 存根，13 个组件依赖 |
| [`ink/cursor.ts`](src/ink/cursor.ts) | 光标类型定义 `{ x, y, visible }` |
| [`ink/events/paste-event.ts`](src/ink/events/paste-event.ts) | 粘贴事件类型 |
| [`ink/events/resize-event.ts`](src/ink/events/resize-event.ts) | 窗口缩放事件类型 |
| [`ink/jsx-intrinsic-elements.d.ts`](src/ink/jsx-intrinsic-elements.d.ts) | JSX 内置元素类型声明 |

这些是 smink 为独立运行的**必要适配**，原版中对应内容是内联的或由构建系统生成。

### 2. `utils/` 差异

#### 2.1 `utils/debug.ts`

| 维度 | smink | Claude Code |
|------|-------|-------------|
| 大小 | 4.5 KB（195 行） | 7.81 KB（269 行） |
| `logForDebugging` | 级别过滤 + stderr/文件输出 | 同上 + 缓冲写入器 |
| 调试模式检测 | `--debug`、`-d`、`DEBUG` | 同上 + `--debug=pattern` |
| 日志文件 | `getDebugFilePath()`、`getDebugLogPath()` | 同上 + symlink 管理 |
| 日志级别 | `DebugLogLevel` 5 级过滤 | 同上 |

**已去掉**：bufferedWriter、cleanupRegistry、debugFilter、fsOperations、session ID、symlink、USER_TYPE/ant 逻辑

#### 2.2 `utils/env.ts`

| 维度 | smink | Claude Code |
|------|-------|-------------|
| `detectTerminal()` | 30+ 种终端检测（已对齐原版） | 30+ 种终端检测 |
| `JETBRAINS_IDES` | ✅ 已对齐 | ✅ 相同 |
| `isSSHSession()` | ✅ 已对齐 | ✅ 相同 |
| `isWslEnvironment()` | ✅ 已对齐（用 `fs.existsSync` 替代 `getFsImplementation`） | ✅ 完整（用 `getFsImplementation`） |

**已去掉**（Claude 业务逻辑）：`getGlobalClaudeFile`、`hasInternetAccess`、`detectPackageManagers`/`detectRuntimes`、`isNpmFromWindowsPath`、`isConductor`、`detectDeploymentEnvironment`、`getHostPlatformForAnalytics`、`isRunningWithBun`

#### 2.3 `utils/intl.ts`

| 维度 | smink | Claude Code |
|------|-------|-------------|
| `getRelativeTimeFormat()` | ✅ 已对齐 | ✅ 相同 |
| `getTimeZone()` | ✅ 已对齐 | ✅ 相同 |
| `getSystemLocaleLanguage()` | ✅ 已对齐 | ✅ 相同 |

#### 2.4 `utils/execFileNoThrow.ts`

| 维度 | smink | Claude Code |
|------|-------|-------------|
| 实现 | `execa` | `execa` |
| `abortSignal` | ✅ 已支持 | ✅ 相同 |
| `preserveOutputOnError` | ✅ 已支持 | ✅ 相同 |
| `maxBuffer` | ✅ 已支持（默认 1MB） | ✅ 相同 |
| `execFileNoThrowWithCwd()` | ✅ 已导出 | ✅ 相同 |
| `getErrorMessage()` | ✅ 已实现 | ✅ 相同 |

**仅有的差异**：`useCwd` 默认 `false`（无 `getCwd()` 依赖）、catch 中无 `logError`（让调用方决定）。

#### 2.5 `utils/semver.ts`

| 维度 | smink | Claude Code |
|------|-------|-------------|
| 实现 | re-export npm `semver` | Bun.semver 快速路径 + npm fallback |

**影响**：无。smink 用 npm semver 即可。

#### 2.6 `utils/earlyInput.ts`

仅有注释措辞差异（smink 说 "TUI"，原版说 "REPL"），**无运行时影响**。

### 3. `bootstrap/state.ts` 差异

| 维度 | smink | Claude Code |
|------|-------|-------------|
| 大小 | 4.38 KB（138 行） | 54.79 KB（1759 行） |
| 交互时间追踪 | ✅ 已实现 | ✅ 相同 |
| 滚动防抖 | ✅ 已实现 | ✅ 相同 |
| 交互模式标记 | ✅ 已实现 | ✅ 相同 |
| 会话/费用/遥测/OAuth | ❌ 有意省略 | ✅ 完整实现 |

smink 已实现 TUI 框架所需的核心状态。其余均为 Claude 业务逻辑，smink 不需要。

### 4. `native-ts/` 差异

| 模块 | smink | Claude Code |
|------|-------|-------------|
| `native-ts/yoga-layout/` | ✅ 纯 TS Yoga | ✅ 相同 |
| `native-ts/color-diff/` | ❌ 缺失 | ✅ 代码差异高亮 |
| `native-ts/file-index/` | ❌ 缺失 | ✅ 模糊文件搜索 |

`color-diff` 和 `file-index` 是业务模块，与 TUI 渲染无关，smink 不需要。

## 九、 与官方 Ink 的详细对比

Claude Code 对 Ink 进行了**大规模深度重写**。核心 `ink.tsx` 从官方的约 200 行膨胀到约 5000+ 行（246KB），几乎每个模块都有根本性改造。以下按模块逐一对比：

### 1. 渲染引擎

| 特性 | 官方 Ink | smink |
|------|---------|-------|
| 渲染方式 | 全量重绘，每帧输出完整内容 | **双缓冲差分渲染**，只输出变化的 cell |
| 屏幕缓冲 | 无 | [`screen.ts`](src/ink/screen.ts)（48KB）维护前/后双缓冲区，cell 池化复用 |
| 渲染管线 | React → Yoga → 序列化 → 输出 | React → Yoga → **render-node-to-output**（62KB）→ 差分计算 → 最小化输出 |
| 闪烁 | 全量重绘容易闪烁 | 差分渲染最大程度减少闪烁 |
| 性能优化 | 无 | 视口裁剪（ScrollBox 内只渲染可见元素）、cell 对象池、跳过不变行 |

### 2. 布局引擎

| 特性 | 官方 Ink | smink |
|------|---------|-------|
| Yoga 引擎 | `yoga-layout-prebuilt`（WASM / 原生 Node addon） | **纯 TypeScript 移植**（[`native-ts/yoga-layout/`](src/native-ts/yoga-layout/)，81KB） |
| 安装依赖 | 需要 native 编译环境 | 零原生依赖，纯 JS |
| 跨平台 | Windows/ARM 可能编译失败 | 任何支持 JS 的平台均可运行 |

### 3. 终端 I/O

| 特性 | 官方 Ink | smink |
|------|---------|-------|
| 输入处理 | 基本的 raw stdin 读取 | **完整的终端协议栈**（`termio/`） |
| 键盘协议 | 基本的 `key.leftArrow` 等 | **Kitty 键盘协议**，支持 modifyOtherKeys、完整修饰键组合 |
| 鼠标追踪 | 无 | **SGR 鼠标追踪**，支持 mode 1002/1003/1006 |
| 转义序列 | 无 | **CSI**、**DEC**、**OSC** 完整解析 |
| Alt-Screen | 无 | **DEC 1049** Alt-Screen 缓冲区切换 |
| 终端焦点 | 无 | **DECSET 1004** 终端焦点事件 |
| 括号粘贴 | 无 | **括号粘贴模式** 检测 |

### 4. 文本选择

| 特性 | 官方 Ink | smink |
|------|---------|-------|
| 鼠标选择 | 无 | **完整的鼠标文本选择系统**（[`selection.ts`](src/ink/selection.ts)，34KB） |
| 选择模式 | 无 | 字符模式、词模式（双击）、行模式（三击） |
| 剪贴板 | 无 | 选择内容自动复制到剪贴板 |
| 禁止选择 | 无 | `NoSelect` 组件标记不可选择区域 |

### 5. 滚动系统

| 特性 | 官方 Ink | smink |
|------|---------|-------|
| 可滚动容器 | 无 | **`ScrollBox`**（31KB），功能完备的滚动容器 |
| 粘底滚动 | 无 | `stickyScroll` 自动跟随新内容 |
| 视口裁剪 | 无 | 只渲染可见区域内的元素 |
| 命令式 API | 无 | `scrollTo`、`scrollBy`、`scrollToBottom`、`scrollToElement` |

### 6. 新增组件

| 组件 | 官方 Ink | smink | 说明 |
|------|---------|-------|------|
| `ScrollBox` | ❌ | ✅ | 可滚动容器，粘底、视口裁剪 |
| `AlternateScreen` | ❌ | ✅ | Alt-Screen 缓冲区，SGR 鼠标追踪 |
| `NoSelect` | ❌ | ✅ | 禁止文本选择 |
| `RawAnsi` | ❌ | ✅ | 原始 ANSI 输出，绕过解析流程 |
| `Ansi` | ❌ | ✅ | 解析 ANSI 文本渲染 |
| `Button` | 简单 | ✅ 深度增强 | 焦点/悬停/激活状态、Tab 导航 |
| `Link` | ❌ | ✅ | OSC 8 终端超链接 |

### 7. 新增 Hooks

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

### 8. Reconciler 改造

| 特性 | 官方 Ink | smink |
|------|---------|-------|
| React 模式 | Legacy Root | **ConcurrentRoot**（React 19） |
| 焦点管理 | 无 | **FocusManager** 集成，`commitMount` 时自动聚焦 |
| 滚动感知 | 无 | Reconciler 感知滚动活动，优化调度 |

### 9. 文本处理增强

| 特性 | 官方 Ink | smink |
|------|---------|-------|
| `stringWidth` | 依赖第三方包 | 内置实现，支持 **Bun.stringWidth** 加速 |
| `wrapAnsi` | 依赖第三方包 | 内置实现，支持 **Bun.wrapAnsi** 加速 |
| 双向文本 | 无 | **bidi-js** 集成，支持阿拉伯语/希伯来语 |
| Emoji 宽度 | 基本支持 | **emoji-regex** + **get-east-asian-width** 增强处理 |

## 十、 总结

| 维度 | 官方 Ink | smink |
|------|---------|-------|
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

**一句话概括**：Claude Code 把 Ink 从一个"终端里的 React 渲染器"改造成了"终端 GUI 框架"，smink 将其提取为独立可复用的 TUI 框架。

## 十一、 许可证

MIT

---
*本文档由 markdowncli 技能辅助生成*
