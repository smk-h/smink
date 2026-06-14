/**
 * Claude Code 风格色彩方案
 * 完全对齐 Claude Code darkTheme (theme.ts → darkTheme L440-515)
 * 所有颜色值均从源码逐字段提取，注释标注对应的 darkTheme 字段名
 */

// ── 原始色彩定义（与 darkTheme 一一对应）──
const _T = {
  // ── 基础文字色 ──
  text:                  'rgb(255,255,255)',  // darkTheme.text — 主文字色（白）
  subtle:                'rgb(80,80,80)',     // darkTheme.subtle — 暗灰辅助文字
  inactive:              'rgb(153,153,153)',  // darkTheme.inactive — 非活跃/灰色文字

  // ── Claude 品牌色 ──
  claude:                'rgb(215,119,87)',   // darkTheme.claude — Claude 品牌橙
  claudeShimmer:         'rgb(235,159,127)',  // darkTheme.claudeShimmer — 橙色高亮

  // ── 吉祥物 Clawd ──
  clawdBody:             'rgb(215,119,87)',   // darkTheme.clawd_body — 与 claude 相同
  clawdBg:               'rgb(0,0,0)',        // darkTheme.clawd_background — 纯黑

  // ── 提示符 / 边框 ──
  promptBorder:          'rgb(136,136,136)',  // darkTheme.promptBorder — 中灰边框
  promptBorderShimmer:   'rgb(166,166,166)',  // darkTheme.promptBorderShimmer — 亮灰

  // ── 语义色 ──
  error:                 'rgb(255,107,128)',  // darkTheme.error — 亮红
  success:               'rgb(78,186,101)',   // darkTheme.success — 亮绿
  warning:               'rgb(255,193,7)',    // darkTheme.warning — 琥珀
  permission:            'rgb(177,185,249)',  // darkTheme.permission — 浅蓝紫
  suggestion:            'rgb(177,185,249)',  // darkTheme.suggestion — 浅蓝紫
  background:            'rgb(0,204,204)',    // darkTheme.background — 青色

  // ── Diff 色彩 ──
  diffAdded:             'rgb(34,92,43)',     // darkTheme.diffAdded — 深绿
  diffRemoved:           'rgb(122,41,54)',    // darkTheme.diffRemoved — 深红

  // ── Bash / 工具边框 ──
  bashBorder:            'rgb(253,93,177)',   // darkTheme.bashBorder — 亮粉

  // ── 计划模式 / IDE ──
  planMode:              'rgb(72,150,140)',   // darkTheme.planMode — 灰绿
  ide:                   'rgb(71,130,200)',   // darkTheme.ide — 暗蓝

  // ── 选中 / 快捷模式 ──
  autoAccept:            'rgb(175,135,255)',  // darkTheme.autoAccept — 电紫
  fastMode:              'rgb(255,120,20)',   // darkTheme.fastMode — 亮橙
  chromeYellow:          'rgb(251,188,4)',    // darkTheme.chromeYellow — Chrome 黄

  // ── TUI V2 背景 ──
  userMsgBg:             'rgb(55,55,55)',     // darkTheme.userMessageBackground
  userMsgBgHover:        'rgb(70,70,70)',     // darkTheme.userMessageBackgroundHover
  selectionBg:           'rgb(38,79,120)',    // darkTheme.selectionBg
  bashMsgBg:             'rgb(65,60,65)',     // darkTheme.bashMessageBackgroundColor
} as const

// 带别名的完整色彩对象 — 别名直接引用同一值，保证单一数据源
export const C: Record<string, string> = {
  ..._T,
  // ── 语义别名（组件内可读性）──
  userText:         _T.text,          // 用户消息文字色
  thoughtDim:       _T.subtle,        // 思考状态暗灰
  responseText:     _T.text,          // AI 回复正文
  promptChar:       _T.text,          // 提示符 ❯
  indentBracket:    _T.inactive,      // 缩进符号 ⎿
  bullet:           _T.text,          // 项目符号 ●
  workedDim:        _T.inactive,      // 完成状态 ✻
  hintDim:          _T.promptBorder,  // 底部提示栏 / 边框
  feedHeading:      _T.claude,        // Feed 标题用品牌橙
  feedItem:         _T.subtle,        // Feed 内容暗灰
}
