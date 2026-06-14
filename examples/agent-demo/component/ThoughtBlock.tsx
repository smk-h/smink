/**
 * 思考状态行组件（可折叠） + 思考中动画
 */

import React from 'react'
import { Box, Text } from '../../../src/index.js'
import { C } from '../theme/colors.js'
import { F } from '../theme/figures.js'
import { MODEL_NAME, THINKING_VERBS } from '../theme/constants.js'
import { formatDuration, formatTime } from './utils.js'

// ─── ThoughtBlock ───

export const ThoughtBlock = ({
  durationMs,
  reasoning,
  expanded,
  onToggle,
  thinkStartTime,
}: {
  durationMs: number
  reasoning?: string
  expanded: boolean
  onToggle: () => void
  thinkStartTime?: Date
}) => {
  if (expanded && reasoning) {
    // ── 展开模式：∴ 图标即占位，与 ● 同列对齐 ──
    return (
      <Box flexDirection="column">
        {/* 思考内容（灰色），∴ 本身就是图标，等同于 ● */}
        <Box flexDirection="column">
          <Text color={C.thoughtDim}>
            <Text italic>{F.therefore} </Text>{reasoning}
          </Text>
        </Box>

        {/* 底部：时间 + 模型名 */}
        <Box justifyContent="flex-end" marginTop={0}>
          <Text color={C.thoughtDim}>
            {thinkStartTime ? formatTime(thinkStartTime) : formatTime()}{' '}{MODEL_NAME}
          </Text>
        </Box>
      </Box>
    )
  }

  // ── 折叠模式：纯文字提示（隐形图标占位，与 ● 后文字对齐） ──
  return (
    <Box flexDirection="row">
      {/* 隐形图标占位：宽度 = ● + 空格 */}
      <Text color={C.thoughtDim}>{'  '}</Text>
      <Text color={C.thoughtDim}>
        Thought for {formatDuration(durationMs)}{' '}
        (<Text bold>ctrl+o</Text> to expand)
      </Text>
    </Box>
  )
}

// ─── ThinkingAnimation ───

export const ThinkingAnimation = ({ elapsedMs }: { elapsedMs: number }) => {
  // 动词每 3 秒轮换一次
  const verbIndex = Math.floor(elapsedMs / 3000) % THINKING_VERBS.length
  const verb = THINKING_VERBS[verbIndex]
  const dots = '.'.repeat(Math.floor((elapsedMs / 400) % 4))

  return (
    <Box flexDirection="row">
      <Text color={C.claude}>
        {F.spinner} {verb}{dots} <Text color={C.thoughtDim}>({formatDuration(elapsedMs)} {F.middot} thinking)</Text>
      </Text>
    </Box>
  )
}
