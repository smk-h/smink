/**
 * AI 回复区域组件（含 ● 项目符号 + 流式光标 + 完成状态）
 */

import React, { useState, useEffect } from 'react'
import { Box, Text } from '../../../src/index.js'
import { C } from '../theme/colors.js'
import { F } from '../theme/figures.js'
import { TURN_VERBS } from '../theme/constants.js'
import { formatDuration, pickVerb } from './utils.js'
import { ThoughtBlock, ThinkingAnimation } from './ThoughtBlock.js'
import { MarkdownText } from './markdown.js'
import type { ChatMessage } from './types.js'

export const AssistantResponse = ({
  msg,
  expanded,
  onToggleExpand,
}: {
  msg: ChatMessage
  expanded: boolean
  onToggleExpand: () => void
}) => {
  const isThinking = msg.state === 'thinking'
  const isStreaming = msg.state === 'responding'
  const isDone = msg.state === 'done'

  // 思考开始时间到现在的时长
  const [thinkElapsed, setThinkElapsed] = useState(0)
  // 固定完成动词（仅在首次进入 done 时生成一次）
  const [fixedVerb] = useState(() => pickVerb(TURN_VERBS))

  useEffect(() => {
    if (isThinking && msg.thinkStartMs) {
      const interval = setInterval(() => {
        setThinkElapsed(Date.now() - msg.thinkStartMs!)
      }, 200)
      return () => clearInterval(interval)
    }
    setThinkElapsed(0)
  }, [isThinking, msg.thinkStartMs])

  return (
    <Box flexDirection="column">
      {/* ===== 思考状态行 / 展开的思考内容框 ===== */}
      {isThinking && (
        <ThinkingAnimation elapsedMs={thinkElapsed} />
      )}

      {(isStreaming || isDone) && msg.thinkDurationMs != null && (
        <ThoughtBlock
          durationMs={msg.thinkDurationMs!}
          reasoning={msg.reasoning}
          expanded={expanded}
          onToggle={onToggleExpand}
          thinkStartTime={msg.thinkStartMs ? new Date(msg.thinkStartMs) : undefined}
        />
      )}

      {/* ===== AI 回复内容（与思考框平级对齐，无额外缩进） ===== */}
      {(isStreaming || isDone) && (
        <Box flexDirection="column">
          <Box flexDirection="row">
            <Text color={C.bullet}>{F.bullet} </Text>
            <Box flexGrow={1}>
              <Text color={C.responseText}>
                {msg.content ? (
                  <MarkdownText text={msg.content} color={C.responseText} />
                ) : isStreaming ? '' : '(no content)'}
                {isStreaming && <Text dim>{F.cursor}</Text>}
              </Text>
            </Box>
          </Box>
        </Box>
      )}

      {/* ===== 完成状态行：✻ Worked for Xs ===== — ✻ 自身即图标，无需占位 */}
      {isDone && (
        <Box flexDirection="row" marginTop={1}>
          <Text color={C.workedDim} dim>
            {F.spinner} {fixedVerb} for {formatDuration(msg.totalDurationMs ?? msg.thinkDurationMs ?? 0)}
          </Text>
        </Box>
      )}
    </Box>
  )
}
