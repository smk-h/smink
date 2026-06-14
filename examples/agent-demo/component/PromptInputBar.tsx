/**
 * 底部输入栏组件（仿 Claude Code PromptInputFooter）
 */

import React from 'react'
import { Box, Text } from '../../../src/index.js'
import { C } from '../theme/colors.js'
import { F } from '../theme/figures.js'
import { BlockCursor } from './BlockCursor.js'
import { CommandSuggestionList, ArgumentHint } from './CommandSuggestionList.js'
import { isCommandInput, getCommandQuery } from './slash-commands.js'
import type { TokenUsage, CommandSuggestion } from './types.js'

export const PromptInputBar = ({
  value,
  loading,
  tokenUsage,
  suggestions,
  selectedSuggestion,
  argumentHint,
}: {
  value: string
  loading: boolean
  tokenUsage: TokenUsage
  suggestions: CommandSuggestion[]
  selectedSuggestion: number
  argumentHint?: string
}) => {
  const commandQuery = isCommandInput(value) ? getCommandQuery(value) : ''

  return (
    <Box flexDirection="column">
      {/* 分隔线：只显示顶部边框，与 Claude Code 源码中的 PermissionDialog 同一方式 */}
      <Box
        borderStyle="single"
        borderColor={C.hintDim}
        borderDimColor
        borderLeft={false}
        borderRight={false}
        borderBottom={false}
      />

      {/* ❯ 提示符 + 输入内容（独立行） */}
      {/* 仿 Claude Code TextInput：invert(' ') 反色块状光标，始终可见 */}
      <Box flexDirection="row" paddingX={1}>
        <Text color={C.promptChar} dimColor={loading}>{`${F.pointer} `}</Text>
        {value.length > 0 ? (
          <Text>{value}<BlockCursor /></Text>
        ) : loading ? (
          <Text color={C.hintDim} dim>waiting for response...</Text>
        ) : (
          <BlockCursor />
        )}
      </Box>

      {/* 命令建议列表 / 无匹配提示（仿 Claude Code PromptInputFooterSuggestions） */}
      {isCommandInput(value) && (
        <CommandSuggestionList suggestions={suggestions} selectedIndex={selectedSuggestion} query={commandQuery} input={value} />
      )}

      {/* 参数提示 */}
      {argumentHint && <ArgumentHint hint={argumentHint} />}

      {/* 分隔线：> 提示行与底部区域 — 斜杠命令时由 CommandSuggestionList 自带，此处不重复绘制 */}
      {!isCommandInput(value) && (
        <Box
          borderStyle="single"
          borderColor={C.hintDim}
          borderDimColor
          borderLeft={false}
          borderRight={false}
          borderTop={false}
        />
      )}

      {/* 提示栏：? for shortcuts · -- for agents — 仅输入框为空时显示 */}
      {value.length === 0 && (
        <Box flexDirection="row" paddingX={1} paddingBottom={1}>
          <Text color={C.hintDim} dim>? for shortcuts {F.middot} -- for agents</Text>
        </Box>
      )}
    </Box>
  )
}
