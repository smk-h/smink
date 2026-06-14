/**
 * 用户消息行组件
 */

import React from 'react'
import { Box, Text } from '../../../src/index.js'
import { C } from '../theme/colors.js'
import { F } from '../theme/figures.js'

export const UserMessageLine = ({ text }: { text: string }) => (
  <Box flexDirection="row">
    <Text color={C.promptChar} bold>{F.pointer} </Text>
    <Text color={C.userText}>{text}</Text>
  </Box>
)
