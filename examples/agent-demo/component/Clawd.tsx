/**
 * Clawd 吉祥物组件（仿 Claude Code 源码 Clawd.tsx）
 * 默认姿态 9 列宽，3 行高
 *   ▐▛███▜▌
 *   ▝▜█████▛▘
 *     ▘▘ ▝▝
 */

import React from 'react'
import { Box, Text } from '../../../src/index.js'
import { C } from '../theme/colors.js'

export const Clawd = () => (
  <Box flexDirection="column">
    <Text>
      <Text color={C.claude}>{' ▐'}</Text>
      <Text color={C.claude} backgroundColor={C.clawdBg}>{'▛███▜'}</Text>
      <Text color={C.claude}>{'▌'}</Text>
    </Text>
    <Text>
      <Text color={C.claude}>{'▝▜'}</Text>
      <Text color={C.claude} backgroundColor={C.clawdBg}>{'█████'}</Text>
      <Text color={C.claude}>{'▛▘'}</Text>
    </Text>
    <Text color={C.claude}>{'  ▘▘ ▝▝  '}</Text>
  </Box>
)
