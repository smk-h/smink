/**
 * Fullscreen utilities — tmux/iTerm2 compatibility + env-var toggles.
 *
 * Ported from Claude Code's fullscreen.ts with smink adaptations:
 * - Env vars prefixed `SMINK_*` instead of `CLAUDE_CODE_*`
 * - `logForDebugging` replaced with `logError` (smink has no debug module)
 * - `getIsInteractive()` removed (Claude-specific bootstrap state)
 * - `execFileNoThrow` replaced with `child_process.spawnSync` (smink avoids execa)
 */

import { spawnSync } from 'child_process'
import { isEnvTruthy } from './envUtils.js'
import { logError } from './log.js'

let loggedTmuxCcDisable = false
let checkedTmuxMouseHint = false

/**
 * Cached result from `tmux display-message -p '#{client_control_mode}'`.
 * undefined = not yet queried (or probe failed) — env heuristic stays authoritative.
 */
let tmuxControlModeProbed: boolean | undefined

/**
 * Env-var heuristic for iTerm2's tmux integration mode (`tmux -CC` / `tmux -2CC`).
 *
 * In `-CC` mode, iTerm2 renders tmux panes as native splits — tmux runs
 * as a server (TMUX is set) but iTerm2 is the actual terminal emulator
 * for each pane, so TERM_PROGRAM stays `iTerm.app` and TERM is iTerm2's
 * default (xterm-*). Contrast with regular tmux-inside-iTerm2, where tmux
 * overwrites TERM_PROGRAM to `tmux` and sets TERM to screen-* or tmux-*.
 *
 * This heuristic has known holes (SSH often doesn't propagate TERM_PROGRAM;
 * .tmux.conf can override TERM) — probeTmuxControlModeSync() is the
 * authoritative backstop. Kept as a zero-subprocess fast path.
 */
function isTmuxControlModeEnvHeuristic(): boolean {
  if (!process.env.TMUX) return false
  if (process.env.TERM_PROGRAM !== 'iTerm.app') return false
  // Belt-and-suspenders: in regular tmux TERM is screen-* or tmux-*;
  // in -CC mode iTerm2 sets its own TERM (xterm-*).
  const term = process.env.TERM ?? ''
  return !term.startsWith('screen') && !term.startsWith('tmux')
}

/**
 * Sync one-shot probe: asks tmux directly whether this client is in control
 * mode via `#{client_control_mode}`. Runs on first isTmuxControlMode() call
 * when the env heuristic can't decide; result is cached.
 *
 * Sync (spawnSync) because the answer gates whether we enter fullscreen — an
 * async probe raced against React render and lost: coder-tmux (ssh → tmux -CC
 * on a remote box) doesn't propagate TERM_PROGRAM, so the env heuristic missed,
 * and by the time the async probe resolved we'd already entered alt-screen with
 * mouse tracking enabled. Mouse wheel is dead in iTerm2's -CC integration, so
 * users couldn't scroll at all.
 *
 * Cost: one ~5ms subprocess, only when $TMUX is set AND $TERM_PROGRAM is unset
 * (the SSH-into-tmux case). Local iTerm2 -CC and non-tmux paths skip the spawn.
 */
function probeTmuxControlModeSync(): void {
  // Seed cache with heuristic result so early returns below don't leave it
  // undefined — isTmuxControlMode() is called many times per render, and an
  // undefined cache would re-enter this function on every call.
  tmuxControlModeProbed = isTmuxControlModeEnvHeuristic()
  if (tmuxControlModeProbed) return
  if (!process.env.TMUX) return
  // Only probe when iTerm might be involved: TERM_PROGRAM is iTerm.app
  // (covered above) or not set (SSH often doesn't propagate it). When
  // TERM_PROGRAM is explicitly a non-iTerm terminal, skip — tmux -CC is
  // an iTerm-only feature, so the subprocess would be wasted.
  if (process.env.TERM_PROGRAM) return
  let result
  try {
    result = spawnSync(
      'tmux',
      ['display-message', '-p', '#{client_control_mode}'],
      { encoding: 'utf8', timeout: 2000 },
    )
  } catch {
    return
  }
  // Non-zero exit / spawn error: tmux too old (format var added in 2.4) or
  // unavailable. Keep the heuristic result cached.
  if (result.status !== 0) return
  tmuxControlModeProbed = result.stdout.trim() === '1'
}

/**
 * True when running under `tmux -CC` (iTerm2 integration mode).
 *
 * The alt-screen / mouse-tracking path in fullscreen mode is unrecoverable
 * in -CC mode (double-click corrupts terminal state; mouse wheel is dead),
 * so callers auto-disable fullscreen.
 *
 * Lazily probes tmux on first call when the env heuristic can't decide.
 */
export function isTmuxControlMode(): boolean {
  if (tmuxControlModeProbed === undefined) probeTmuxControlModeSync()
  return tmuxControlModeProbed ?? false
}

export function _resetTmuxControlModeProbeForTesting(): void {
  tmuxControlModeProbed = undefined
  loggedTmuxCcDisable = false
  checkedTmuxMouseHint = false
}

/**
 * Whether fullscreen alt-screen mode is enabled.
 * Set SMINK_FULLSCREEN=1 to enable, SMINK_FULLSCREEN=0 to disable.
 * Auto-disabled under tmux -CC (iTerm2 integration mode).
 */
export function isFullscreenEnvEnabled(): boolean {
  // Explicit user opt-out always wins.
  if (process.env.SMINK_FULLSCREEN === '0') return false
  // Explicit opt-in overrides auto-detection.
  if (isEnvTruthy(process.env.SMINK_FULLSCREEN)) return true
  // Auto-disable under tmux -CC: alt-screen + mouse tracking corrupts
  // terminal state on double-click and mouse wheel is dead.
  if (isTmuxControlMode()) {
    if (!loggedTmuxCcDisable) {
      loggedTmuxCcDisable = true
      logError(
        new Error(
          'fullscreen disabled: tmux -CC (iTerm2 integration mode) detected · set SMINK_FULLSCREEN=1 to override',
        ),
      )
    }
    return false
  }
  // Default: off (unlike Claude Code which defaults on for internal users)
  return false
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

/**
 * One-time hint for tmux users in fullscreen with `mouse off`.
 *
 * tmux's `mouse` option is session-scoped by design — there is no
 * pane-level equivalent. We leave tmux state alone — same as
 * vim/less/htop — and just tell the user their options.
 *
 * Fire-and-forget from app startup. Returns the hint text once per
 * session if TMUX is set, fullscreen is active, and tmux's current
 * `mouse` option is off; null otherwise.
 */
export async function maybeGetTmuxMouseHint(): Promise<string | null> {
  if (!process.env.TMUX) return null
  // tmux -CC auto-disables fullscreen above, but belt-and-suspenders.
  if (!isFullscreenActive() || isTmuxControlMode()) return null
  if (checkedTmuxMouseHint) return null
  checkedTmuxMouseHint = true
  let result
  try {
    result = spawnSync(
      'tmux',
      ['show', '-Av', 'mouse'],
      { encoding: 'utf8', timeout: 2000 },
    )
  } catch {
    return null
  }
  if (result.status !== 0 || result.stdout.trim() === 'on') return null
  return "tmux detected · scroll with PgUp/PgDn · or add 'set -g mouse on' to ~/.tmux.conf for wheel scroll"
}

/** Test-only: reset module-level once-per-session flags. */
export function _resetForTesting(): void {
  loggedTmuxCcDisable = false
  checkedTmuxMouseHint = false
}
