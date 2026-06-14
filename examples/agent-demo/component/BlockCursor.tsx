/**
 * 块状光标组件
 * 仿 Claude Code invert(' ') 反色光标
 * Claude Code 使用 chalk.inverse（ANSI SGR 7 反色）渲染 invert(' ')，
 * 将空格的前景/背景色互换，产生实心块状光标效果。
 * 此处用 Ink 的 backgroundColor 模拟相同效果。
 * 注意：Claude Code 的输入光标不闪烁，始终为静态反色块。
 */

import React from 'react'
import { Text } from '../../../src/index.js'
import { C } from '../theme/colors.js'

export const BlockCursor = () => (
  <Text backgroundColor={C.text} color="black"> </Text>
)
