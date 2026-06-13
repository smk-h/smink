/**
 * Bootstrap state stubs for the smink framework.
 *
 * The original has Claude Code specific state (session IDs, API tracking, etc).
 * Replace with your own implementation if needed.
 */

/** Flush interaction time telemetry. No-op by default. */
export function flushInteractionTime(): void {}

/** Update last interaction timestamp. No-op by default. */
export function updateLastInteractionTime(): void {}

/** Mark scroll activity for tracking. No-op by default. */
export function markScrollActivity(): void {}

/** Whether running in interactive REPL mode. Default: true when stdin is TTY. */
export function getIsInteractive(): boolean {
  return !!process.stdin.isTTY
}
