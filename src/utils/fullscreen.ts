/**
 * Fullscreen utilities for the smink framework.
 *
 * The original has Claude Code specific tmux/iTerm2 detection.
 * Replace with your own terminal detection logic if needed.
 */

import { isEnvTruthy } from './envUtils.js'

/**
 * Whether fullscreen alt-screen mode is enabled.
 * Set SMINK_FULLSCREEN=1 to enable, SMINK_FULLSCREEN=0 to disable.
 */
export function isFullscreenEnvEnabled(): boolean {
  return isEnvTruthy(process.env.SMINK_FULLSCREEN)
}

/**
 * Whether mouse tracking is enabled in fullscreen mode.
 * Set SMINK_DISABLE_MOUSE=1 to disable.
 */
export function isMouseTrackingEnabled(): boolean {
  return !isEnvTruthy(process.env.SMINK_DISABLE_MOUSE)
}

/**
 * Whether mouse click handling is disabled.
 * Set SMINK_DISABLE_MOUSE_CLICKS=1 to disable.
 */
export function isMouseClicksDisabled(): boolean {
  return isEnvTruthy(process.env.SMINK_DISABLE_MOUSE_CLICKS)
}

/**
 * Whether fullscreen mode is actually active.
 * Override this with your own application logic.
 */
export function isFullscreenActive(): boolean {
  return isFullscreenEnvEnabled()
}
