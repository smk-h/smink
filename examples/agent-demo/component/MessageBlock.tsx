/**
 * 单条消息渲染组件
 */

import React from 'react'
import { Box } from '../../../src/index.js'
import { UserMessageLine } from './UserMessageLine.js'
import { AssistantResponse } from './AssistantResponse.js'
import type { ChatMessage } from './types.js'

export const MessageBlock = ({
  msg,
  expanded,
  onToggleExpand,
}: {
  msg: ChatMessage
  expanded: boolean
  onToggleExpand: () => void
}) => {
  if (msg.role === 'user') {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <UserMessageLine text={msg.content} />
      </Box>
    )
  }

  // assistant message
  return (
    <Box flexDirection="column" marginBottom={1}>
      <AssistantResponse msg={msg} expanded={expanded} onToggleExpand={onToggleExpand} />
    </Box>
  )
}
