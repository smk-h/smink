/**
 * 斜杠命令注册表 + 匹配引擎
 * 仿 Claude Code COMMANDS 注册表 + commandSuggestions
 */

import type { SlashCommand, CommandSuggestion } from './types.js'

// ─── 斜杠命令注册表 ───

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: 'hello',
    description: 'Say hello to the assistant',
    prompt: '你好',
  },
  {
    name: 'sky',
    description: 'Ask why the sky is blue',
    prompt: '天空为什么是蓝色的',
  },
  {
    name: 'skills',
    aliases: ['s'],
    description: 'Ask what the assistant can do',
    prompt: '你可以做什么',
  },
]

// ─── 斜杠命令匹配引擎 ───

/** 检测输入是否为斜杠命令 */
export function isCommandInput(input: string): boolean {
  return input.startsWith('/')
}

/** 从输入中提取命令查询词（去除 / 和参数） */
export function getCommandQuery(input: string): string {
  const spaceIndex = input.indexOf(' ')
  if (spaceIndex === -1) return input.slice(1).toLowerCase()
  return input.slice(1, spaceIndex).toLowerCase()
}

/** 检测输入中是否已有参数 */
export function hasCommandArgs(input: string): boolean {
  if (!isCommandInput(input)) return false
  const spaceIndex = input.indexOf(' ')
  if (spaceIndex === -1) return false
  // 只有空格没有实际内容不算有参数
  return input.slice(spaceIndex + 1).trim().length > 0
}

/** 精确匹配 + 别名匹配 + 前缀模糊匹配，返回排序后的建议列表 */
export function generateCommandSuggestions(input: string): CommandSuggestion[] {
  if (!isCommandInput(input)) return []
  // 有实际参数时不展示建议
  if (hasCommandArgs(input)) return []

  const query = input.slice(1).toLowerCase().trim()

  // 仅输入 / 时展示全部命令
  if (query === '') {
    return SLASH_COMMANDS.map(cmd => ({ command: cmd }))
  }

  const results: CommandSuggestion[] = []
  const seen = new Set<string>()

  // 优先级 1：精确名称匹配
  for (const cmd of SLASH_COMMANDS) {
    if (cmd.name.toLowerCase() === query && !seen.has(cmd.name)) {
      seen.add(cmd.name)
      results.push({ command: cmd })
    }
  }

  // 优先级 2：精确别名匹配
  for (const cmd of SLASH_COMMANDS) {
    if (seen.has(cmd.name)) continue
    const matchedAlias = cmd.aliases?.find(a => a.toLowerCase() === query)
    if (matchedAlias) {
      seen.add(cmd.name)
      results.push({ command: cmd, matchedAlias })
    }
  }

  // 优先级 3：名称前缀匹配
  for (const cmd of SLASH_COMMANDS) {
    if (seen.has(cmd.name)) continue
    if (cmd.name.toLowerCase().startsWith(query)) {
      seen.add(cmd.name)
      results.push({ command: cmd })
    }
  }

  // 优先级 4：别名前缀匹配
  for (const cmd of SLASH_COMMANDS) {
    if (seen.has(cmd.name)) continue
    const matchedAlias = cmd.aliases?.find(a => a.toLowerCase().startsWith(query))
    if (matchedAlias) {
      seen.add(cmd.name)
      results.push({ command: cmd, matchedAlias })
    }
  }

  // 优先级 5：名称包含匹配（简单模糊）
  for (const cmd of SLASH_COMMANDS) {
    if (seen.has(cmd.name)) continue
    if (cmd.name.toLowerCase().includes(query)) {
      seen.add(cmd.name)
      results.push({ command: cmd })
    }
  }

  // 优先级 6：描述包含匹配
  for (const cmd of SLASH_COMMANDS) {
    if (seen.has(cmd.name)) continue
    if (cmd.description.toLowerCase().includes(query)) {
      seen.add(cmd.name)
      results.push({ command: cmd })
    }
  }

  return results
}

/** 获取最佳匹配用于补全 */
export function getBestCommandMatch(
  partialCommand: string,
): { suffix: string; fullCommand: string } | null {
  if (!partialCommand) return null
  const query = partialCommand.toLowerCase()

  // 先查名称前缀
  for (const cmd of SLASH_COMMANDS) {
    if (cmd.name.toLowerCase().startsWith(query)) {
      const suffix = cmd.name.slice(partialCommand.length)
      if (suffix) return { suffix, fullCommand: cmd.name }
    }
  }

  // 再查别名前缀（补全为真实名称）
  for (const cmd of SLASH_COMMANDS) {
    const matchedAlias = cmd.aliases?.find(a => a.toLowerCase().startsWith(query))
    if (matchedAlias) {
      const suffix = cmd.name.slice(partialCommand.length)
      if (suffix) return { suffix, fullCommand: cmd.name }
      return null
    }
  }

  return null
}

/** 解析斜杠命令，返回命令对象和参数 */
export function parseSlashCommand(inputStr: string): { command: SlashCommand; args: string } | null {
  const trimmed = inputStr.trim()
  if (!trimmed.startsWith('/')) return null

  const withoutSlash = trimmed.slice(1)
  const spaceIndex = withoutSlash.indexOf(' ')
  const commandName = spaceIndex === -1 ? withoutSlash : withoutSlash.slice(0, spaceIndex)
  const args = spaceIndex === -1 ? '' : withoutSlash.slice(spaceIndex + 1)
  const query = commandName.toLowerCase()

  // 精确名称匹配
  const exactMatch = SLASH_COMMANDS.find(cmd => cmd.name.toLowerCase() === query)
  if (exactMatch) return { command: exactMatch, args }

  // 别名匹配
  const aliasMatch = SLASH_COMMANDS.find(cmd =>
    cmd.aliases?.some(a => a.toLowerCase() === query),
  )
  if (aliasMatch) return { command: aliasMatch, args }

  return null
}
