/**
 * Environment detection utilities for the smink framework.
 *
 * Simplified version of Claude Code's env module.
 * Replace with your own environment detection if needed.
 */

import { isEnvTruthy } from './envUtils.js'

type Platform = 'win32' | 'darwin' | 'linux'

function detectTerminal(): string | null {
  if (process.env.TERM_PROGRAM) return process.env.TERM_PROGRAM
  if (process.env.TMUX) return 'tmux'
  if (process.env.KITTY_WINDOW_ID) return 'kitty'
  if (process.env.ALACRITTY_LOG) return 'alacritty'
  if (process.env.WT_SESSION) return 'windows-terminal'
  if (process.env.TERM) return process.env.TERM
  return null
}

export const env = {
  isCI: isEnvTruthy(process.env.CI),
  platform: (['win32', 'darwin'].includes(process.platform)
    ? process.platform
    : 'linux') as Platform,
  arch: process.arch,
  nodeVersion: process.version,
  terminal: detectTerminal(),
}
