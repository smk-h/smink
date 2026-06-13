/**
 * smink Hello World 示例
 *
 * 最简 smink 应用，演示基本的 render / Box / Text / useInput 用法
 */

import React from 'react'
import { render, Box, Text, useInput, useApp } from '../src/index.js'

const App = () => {
  const { exit } = useApp()

  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit()
    }
  })

  return (
    <Box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      padding={2}
    >
      <Text color="ansi:cyan" bold>
        ╔══════════════════════════╗
      </Text>
      <Text color="ansi:cyan" bold>
        ║   Hello from smink! 🎉   ║
      </Text>
      <Text color="ansi:cyan" bold>
        ╚══════════════════════════╝
      </Text>
      <Text color="ansi:blackBright">按 q 退出</Text>
    </Box>
  )
}

render(<App />)
