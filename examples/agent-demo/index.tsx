/**
 * Claude Code Style Terminal UI - 入口
 * 仿 Claude Code 终端界面
 *
 * 功能：
 *   - 仿 Claude Code 的暗色终端风格
 *   - `>` 提示符输入
 *   - 用户消息显示为 `> 文本`
 *   - 思考内容折叠显示：Thought for Xs (ctrl+o to expand)，浅灰色
 *   - Ctrl+O 展开思考内容（带边框、完整思维链、时间戳、模型名）
 *   - AI 回复带 ● 项目符号 + 流式光标
 *   - ✻ Worked for Xs 完成状态
 *   - 底部快捷键提示栏
 *   - 流式输出支持 reasoning_content
 *   - 斜杠命令 + 建议列表 + Tab 补全
 *
 * 快捷键：
 *   Enter    - 发送消息
 *   Ctrl+C   - 退出
 *   Ctrl+L   - 清空对话
 *   Ctrl+O   - 展开/折叠最新消息的思考内容
 */

import React from 'react'
import { render } from '../../src/index.js'
import { App } from './App.js'

render(<App />)
