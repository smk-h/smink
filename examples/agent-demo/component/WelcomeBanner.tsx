/**
 * 欢迎栏组件（仿 Claude Code LogoV2 布局）
 */

import React from 'react'
import { Box, Text, colorize } from '../../../src/index.js'
import { stringWidth } from '../../../src/ink/stringWidth.js'
import { C } from '../theme/colors.js'
import { F } from '../theme/figures.js'
import { MODEL_NAME } from '../theme/constants.js'
import { Clawd } from './Clawd.js'

// ─── 左列宽度计算（仿 Claude Code logoV2Utils.ts）───────────

const MAX_LEFT_WIDTH = 50
const CLAWD_ART_MIN_WIDTH = 20 // 与 Claude Code logoV2Utils.ts 一致

/** 根据左列内容动态计算最优宽度 */
function calculateOptimalLeftWidth(
  greeting: string,
  cwd: string,
  modelLine: string,
): number {
  const contentWidth = Math.max(
    stringWidth(greeting),
    stringWidth(cwd),
    stringWidth(modelLine),
    CLAWD_ART_MIN_WIDTH,
  )
  return Math.min(contentWidth + 4, MAX_LEFT_WIDTH) // +4 for padding
}

// ─── WelcomeBanner ───

interface WelcomeBannerProps {
  /** 应用名 + 版本标题，如 "Claude Code v2.1.175" */
  title?: string
  /** 欢迎语，如 "Welcome back!" */
  greeting?: string
  /** 模型名 */
  model?: string
  /** 当前工作目录 */
  cwd?: string
  /**
   * - true  → 订阅用户，显示套餐名（如 "Claude Pro"）
   * - false → API Key 用户，显示 "API Usage Billing"
   */
  isSubscriber?: boolean
  /** 订阅套餐名，仅 isSubscriber=true 时生效 */
  subscriptionName?: string
  /** 右列 Feed 条目列表 */
  feeds?: Array<{ heading: string; items: string[] }>
}

export const WelcomeBanner = ({
  title = 'Claude Code',
  greeting = 'Welcome back!',
  model = MODEL_NAME,
  cwd = process.cwd(),
  isSubscriber = false,
  subscriptionName = 'Claude Pro',
  feeds,
}: WelcomeBannerProps) => {
  const defaultFeeds: NonNullable<WelcomeBannerProps['feeds']> = [
    { heading: 'Recent activity', items: ['No recent sessions'] },
    { heading: "What's new", items: ['Check /release-notes for updates'] },
  ]
  const feedList = feeds ?? defaultFeeds

  // 计费类型：与 Claude Code logoV2Utils.getLogoDisplayData 一致
  const billingType = isSubscriber ? subscriptionName : 'API Usage Billing'

  // 动态计算左列宽度（仿 Claude Code logoV2Utils.calculateOptimalLeftWidth）
  const modelLine = `${model} ${F.middot} ${billingType}`
  const leftWidth = calculateOptimalLeftWidth(greeting, cwd, modelLine)

  // 边框标题：与 Claude Code LogoV2 源码 formatBorderTitle 一致
  const borderTitle = ` ${colorize(title, C.claude, 'foreground')} ${colorize('v2.1.175', C.inactive, 'foreground')} `

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={C.claude}
      borderText={{
        content: borderTitle,
        position: 'top',
        align: 'start',
        offset: 3,
      }}
      paddingX={1}
    >
      <Box flexDirection="row">
        {/* 左列：欢迎语 + Clawd 吉祥物 + 模型信息 — 宽度由内容动态决定 */}
        <Box flexDirection="column" width={leftWidth} alignItems="center" paddingY={1}>
          <Box marginBottom={1}>
            <Text color={C.inactive}>{greeting}</Text>
          </Box>
          <Clawd />
          <Box flexDirection="column" alignItems="center" marginTop={1}>
            <Text color={C.inactive} dim>{model} {F.middot} {billingType}</Text>
            <Text color={C.inactive} dim>{cwd}</Text>
          </Box>
        </Box>

        {/* 竖线分隔：与 Claude Code 源码 borderColor="claude" borderDimColor 一致 */}
        <Box
          borderStyle="single"
          borderColor={C.claude}
          borderDimColor
          borderLeft
          borderRight={false}
          borderTop={false}
          borderBottom={false}
        />

        {/* 右列：Feed 信息 */}
        <Box flexDirection="column" flexGrow={1} paddingLeft={1}>
          {feedList.map((feed, i) => (
            <Box
              key={feed.heading}
              flexDirection="column"
              marginBottom={i < feedList.length - 1 ? 1 : 0}
              marginTop={i > 0 ? 1 : 0}
            >
              <Text color={C.claude} bold>{feed.heading}</Text>
              {feed.items.map(item => (
                <Text key={item} dim>{F.middot} {item}</Text>
              ))}
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  )
}
