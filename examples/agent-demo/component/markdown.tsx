/**
 * 简易 Markdown 渲染器
 * 将 LLM 返回的 Markdown 转为 Ink Text 组件
 * 支持：**bold**、*italic*、`code` 行内渲染
 */

import React from 'react'
import { Text } from '../../../src/index.js'
import type { MdSegment } from './types.js'

/** 将含 markdown 的纯文本拆分为分段，每段带样式标记 */
export function parseInlineMarkdown(text: string): MdSegment[] {
  const segments: MdSegment[] = []
  // 正则：匹配 **bold**、*italic*、`code`（非贪婪，按优先级）
  const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)/gs
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    // 前面的普通文本
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index) })
    }
    if (match[1]) {
      // **bold**
      segments.push({ text: match[2], bold: true })
    } else if (match[3]) {
      // *italic*
      segments.push({ text: match[4], italic: true })
    } else if (match[5]) {
      // `code`
      segments.push({ text: match[6], code: true })
    }
    lastIndex = regex.lastIndex
  }
  // 尾部剩余文本
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex) })
  }
  return segments
}

/** 渲染 Markdown 文本为单行 Ink Text（内联拼接所有片段） */
export const MarkdownText = ({ text, color }: { text: string; color?: string }) => {
  const segments = parseInlineMarkdown(text)
  // 所有片段作为 <Text> 的子元素行内拼接，保证换行宽度计算正确
  return (
    <Text>
      {segments.map((seg, i) => (
        <Text key={i} color={color} bold={seg.bold} italic={seg.italic} backgroundColor={seg.code ? 'rgb(60,60,60)' : undefined}>
          {seg.text}
        </Text>
      ))}
    </Text>
  )
}
