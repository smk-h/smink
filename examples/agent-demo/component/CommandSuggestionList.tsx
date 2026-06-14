/**
 * 命令建议列表 + 参数提示 + 高亮文本
 * 仿 Claude Code PromptInputFooterSuggestions 双列布局
 */

import React from 'react'
import { Box, Text } from '../../../src/index.js'
import { C } from '../theme/colors.js'
import { MAX_VISIBLE_SUGGESTIONS, COMMAND_COL_WIDTH } from '../theme/constants.js'
import { truncateToWidth } from './utils.js'
import { isCommandInput, hasCommandArgs, getCommandQuery } from './slash-commands.js'
import type { CommandSuggestion } from './types.js'

// ─── 匹配字符高亮色 ───
const MATCH_HIGHLIGHT_COLOR = C.suggestion // 浅蓝紫，与选中色一致

// ─── HighlightText ───

/**
 * 高亮文本中匹配查询词的字符
 * 将 text 中所有匹配 query 的子串用指定颜色+粗体渲染
 */
export function HighlightText({
  text,
  query,
  color,
  dim,
  bold,
}: {
  text: string
  query: string
  color?: string
  dim?: boolean
  bold?: boolean
}) {
  if (!query) {
    return <Text color={color} dim={dim} bold={bold}>{text}</Text>
  }

  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const parts: Array<{ text: string; isMatch: boolean }> = []
  let searchFrom = 0

  while (searchFrom < lowerText.length) {
    const idx = lowerText.indexOf(lowerQuery, searchFrom)
    if (idx === -1) {
      parts.push({ text: text.slice(searchFrom), isMatch: false })
      break
    }
    // 前面的非匹配部分
    if (idx > searchFrom) {
      parts.push({ text: text.slice(searchFrom, idx), isMatch: false })
    }
    // 匹配部分
    parts.push({ text: text.slice(idx, idx + query.length), isMatch: true })
    searchFrom = idx + query.length
  }

  return (
    <>
      {parts.map((part, i) => (
        <Text
          key={i}
          color={part.isMatch ? MATCH_HIGHLIGHT_COLOR : color}
          bold={part.isMatch ? true : bold}
          dim={!part.isMatch && dim}
        >
          {part.text}
        </Text>
      ))}
    </>
  )
}

// ─── NoMatchHint ───

/** 无匹配时的提示（仿 Claude Code "No commands match \"/xxx\""） */
const NoMatchHint = ({ input }: { input: string }) => (
  <Box paddingX={1}>
    <Text color={C.inactive} dim>
      No commands match <Text color={C.suggestion}>"{input}"</Text>
    </Text>
  </Box>
)

// ─── CommandSuggestionList ───

export const CommandSuggestionList = ({
  suggestions,
  selectedIndex,
  query,
  input,
}: {
  suggestions: CommandSuggestion[]
  selectedIndex: number
  query: string
  /** 完整的输入字符串，用于无匹配时显示提示 */
  input: string
}) => {
  // 无匹配且有实际查询词时 → 显示 "No commands match"
  if (suggestions.length === 0 && isCommandInput(input) && hasCommandArgs(input) === false) {
    const q = getCommandQuery(input)
    if (q.length > 0) {
      return (
        <Box flexDirection="column">
          {/* 分隔线 */}
          <Box borderStyle="single" borderColor={C.hintDim} borderDimColor
            borderLeft={false} borderRight={false} borderTop={false} />
          <NoMatchHint input={`/${q}`} />
        </Box>
      )
    }
    return null
  }

  if (suggestions.length === 0) return null

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* 列头分隔线 */}
      <Box borderStyle="single" borderColor={C.hintDim} borderDimColor
        borderLeft={false} borderRight={false} borderTop={false} />
      {suggestions.slice(0, MAX_VISIBLE_SUGGESTIONS).map((suggestion, index) => {
        const cmd = suggestion.command
        const isSelected = index === selectedIndex
        const aliasText = suggestion.matchedAlias ? ` (${suggestion.matchedAlias})` : ''
        const displayName = `/${cmd.name}${aliasText}`
        const displayDesc = cmd.description
          ? truncateToWidth(cmd.description, Math.max(30, process.stdout.columns ?? 80) - COMMAND_COL_WIDTH - 6)
          : ''

        // 选中行：整行统一用 suggestion 色高亮；非选中行：命令名列用默认色，描述用 subtle
        const rowColor = isSelected ? C.suggestion : undefined
        const descColor = isSelected ? C.suggestion : C.subtle

        return (
          <Box key={cmd.name} flexDirection="row">
            {/* 左列：命令名（固定宽度）— 选中时整行高亮 */}
            <Box width={COMMAND_COL_WIDTH}>
              <HighlightText
                text={displayName}
                query={query}
                color={rowColor}
                bold={isSelected}
                dim={!isSelected}
              />
            </Box>
            {/* 右列：描述 — 选中时同样高亮，与左列风格一致 */}
            {displayDesc && (
              <HighlightText
                text={`  ${displayDesc}`}
                query={query}
                color={descColor}
                bold={isSelected}
                dim={!isSelected}
              />
            )}
          </Box>
        )
      })}
    </Box>
  )
}

// ─── ArgumentHint ───

/** 参数提示（仿 Claude Code commandArgumentHint） */
export const ArgumentHint = ({ hint }: { hint: string }) => (
  <Box paddingX={1}>
    <Text color={C.inactive} dim>{hint}</Text>
  </Box>
)
