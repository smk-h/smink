/**
 * 工具函数
 */

import { stringWidth } from '../../../src/ink/stringWidth.js'

/** 格式化时长（秒），至少返回 1s */
export function formatDuration(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000))
  return `${seconds}s`
}

/** 格式化时间为 "09:02 AM" 风格 */
export function formatTime(date: Date = new Date()): string {
  let hours = date.getHours()
  const minutes = date.getMinutes().toString().padStart(2, '0')
  const ampm = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12 || 12
  return `${hours.toString().padStart(2, '0')}:${minutes} ${ampm}`
}

/** 截断文本到指定显示宽度 */
export function truncateToWidth(text: string, maxWidth: number): string {
  let width = 0
  for (let i = 0; i < text.length; i++) {
    width += stringWidth(text[i])
    if (width > maxWidth) {
      return text.slice(0, i).trimEnd() + '...'
    }
  }
  return text
}

/** 随机选取完成动词 */
export function pickVerb(verbs: string[]): string {
  return verbs[Math.floor(Math.random() * verbs.length)]
}
