/**
 * Debug logging system for smink.
 *
 * Ported from Claude Code's debug.ts, keeping TUI-relevant parts:
 * - Log level filtering (verbose < debug < info < warn < error)
 * - Debug mode detection via env vars and CLI args
 * - Runtime enable/disable
 * - Stderr output
 * - File output (simplified, no buffered writer)
 *
 * Removed (Claude-specific):
 * - Buffered writer (requires bufferedWriter.ts, cleanupRegistry.ts)
 * - Debug filter pattern (--debug=pattern, requires debugFilter.ts)
 * - Session-based log paths (requires bootstrap/state.ts, getSessionId)
 * - Symlink management (requires fsOperations.ts)
 * - USER_TYPE / ant-specific logic
 * - logAntError
 * - setHasFormattedOutput / getHasFormattedOutput
 */

import { appendFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { isEnvTruthy } from './envUtils.js'

// ---------------------------------------------------------------------------
// Log levels
// ---------------------------------------------------------------------------

export type DebugLogLevel = 'verbose' | 'debug' | 'info' | 'warn' | 'error'

const LEVEL_ORDER: Record<DebugLogLevel, number> = {
  verbose: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
}

/**
 * Minimum log level to include in debug output.
 * Defaults to 'debug' (filters out 'verbose').
 * Set SMINK_DEBUG_LOG_LEVEL=verbose to see high-volume diagnostics.
 */
export function getMinDebugLogLevel(): DebugLogLevel {
  const raw = process.env.SMINK_DEBUG_LOG_LEVEL?.toLowerCase().trim()
  if (raw && Object.hasOwn(LEVEL_ORDER, raw)) {
    return raw as DebugLogLevel
  }
  return 'debug'
}

// ---------------------------------------------------------------------------
// Debug mode detection
// ---------------------------------------------------------------------------

let runtimeDebugEnabled = false

/**
 * Whether debug logging is active.
 * Checks env vars, CLI args, and runtime flag.
 */
export function isDebugMode(): boolean {
  return (
    runtimeDebugEnabled ||
    isEnvTruthy(process.env.DEBUG) ||
    process.argv.includes('--debug') ||
    process.argv.includes('-d') ||
    isDebugToStdErr() ||
    getDebugFilePath() !== null
  )
}

/**
 * Enables debug logging mid-session (e.g. via user command).
 * Returns true if logging was already active.
 */
export function enableDebugLogging(): boolean {
  const wasActive = isDebugMode()
  runtimeDebugEnabled = true
  return wasActive
}

/**
 * Whether debug output goes to stderr instead of a file.
 * Set --debug-to-stderr or -d2e to enable.
 */
export function isDebugToStdErr(): boolean {
  return (
    process.argv.includes('--debug-to-stderr') ||
    process.argv.includes('-d2e')
  )
}

/**
 * Custom debug file path from --debug-file=path CLI arg.
 * Returns null if not specified.
 */
export function getDebugFilePath(): string | null {
  for (let i = 0; i < process.argv.length; i++) {
    const arg = process.argv[i]!
    if (arg.startsWith('--debug-file=')) {
      return arg.substring('--debug-file='.length)
    }
    if (arg === '--debug-file' && i + 1 < process.argv.length) {
      return process.argv[i + 1]!
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Log file path
// ---------------------------------------------------------------------------

/**
 * Default debug log directory.
 * Override with SMINK_DEBUG_LOGS_DIR env var.
 */
function getDebugLogDir(): string {
  return process.env.SMINK_DEBUG_LOGS_DIR ?? join(process.env.HOME ?? '/tmp', '.smink', 'debug')
}

/**
 * Returns the debug log file path.
 * Priority: --debug-file > SMINK_DEBUG_LOGS_DIR > default
 */
export function getDebugLogPath(): string {
  const customPath = getDebugFilePath()
  if (customPath) return customPath

  const dir = getDebugLogDir()
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  return join(dir, `${timestamp}.txt`)
}

// ---------------------------------------------------------------------------
// Core logging function
// ---------------------------------------------------------------------------

/**
 * Log a debug message.
 *
 * Output destination depends on mode:
 * - `--debug-to-stderr` / `-d2e`: writes to stderr
 * - `--debug` / `-d` / `DEBUG=1`: writes to debug log file
 * - Otherwise: no-op (debug mode not active)
 *
 * Messages below the minimum log level are filtered out.
 */
export function logForDebugging(
  message: string,
  { level }: { level: DebugLogLevel } = { level: 'debug' },
): void {
  // Level filter
  if (LEVEL_ORDER[level] < LEVEL_ORDER[getMinDebugLogLevel()]) {
    return
  }

  // Only log when debug mode is active
  if (!isDebugMode()) {
    return
  }

  const timestamp = new Date().toISOString()
  const output = `${timestamp} [${level.toUpperCase()}] ${message.trim()}\n`

  if (isDebugToStdErr()) {
    process.stderr.write(output)
    return
  }

  // File output (synchronous to avoid losing logs on process exit)
  try {
    const path = getDebugLogPath()
    const dir = dirname(path)
    mkdirSync(dir, { recursive: true })
    appendFileSync(path, output)
  } catch {
    // Fall back to stderr if file write fails
    try {
      process.stderr.write(output)
    } catch {
      // Silently fail
    }
  }
}

// ---------------------------------------------------------------------------
// Flush (compatibility stub)
// ---------------------------------------------------------------------------

/**
 * Flush any buffered debug logs.
 * In this simplified implementation, writes are synchronous so this is a no-op.
 * Kept for API compatibility with Claude Code's debug.ts.
 */
export async function flushDebugLogs(): Promise<void> {
  // No-op: synchronous writes don't need flushing
}

// ---------------------------------------------------------------------------
// Testing helper
// ---------------------------------------------------------------------------

/**
 * Reset debug state for testing purposes.
 * @internal
 */
export function _resetDebugForTesting(): void {
  runtimeDebugEnabled = false
}
