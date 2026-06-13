/**
 * Error logging with in-memory error log and sink mechanism.
 *
 * Extracted from Claude Code's log.ts, keeping only the TUI-relevant parts:
 * - In-memory error log (ring buffer, max 100 entries)
 * - ErrorLogSink interface + queue for deferred sink attachment
 * - getInMemoryErrors() for inspecting recent errors
 *
 * Removed (business-specific):
 * - MCP error/debug logging
 * - API request capture
 * - Error log file persistence
 * - HARD_FAIL mode
 * - Cloud provider env checks
 */

// ---------------------------------------------------------------------------
// In-memory error log (ring buffer)
// ---------------------------------------------------------------------------

const MAX_IN_MEMORY_ERRORS = 100

type ErrorEntry = { error: string; timestamp: string }

const inMemoryErrorLog: ErrorEntry[] = []

function addToInMemoryErrorLog(errorInfo: ErrorEntry): void {
  if (inMemoryErrorLog.length >= MAX_IN_MEMORY_ERRORS) {
    inMemoryErrorLog.shift()
  }
  inMemoryErrorLog.push(errorInfo)
}

/**
 * Returns a snapshot of recent errors logged during this session.
 * Useful for bug reports or displaying error summaries to users.
 */
export function getInMemoryErrors(): ErrorEntry[] {
  return [...inMemoryErrorLog]
}

// ---------------------------------------------------------------------------
// ErrorLogSink — pluggable backend for error persistence / reporting
// ---------------------------------------------------------------------------

/**
 * Interface for an error logging backend.
 * Attach via `attachErrorLogSink()` during app startup.
 */
export type ErrorLogSink = {
  logError: (error: Error) => void
}

// Queued events logged before a sink is attached
type QueuedErrorEvent = { type: 'error'; error: Error }

const errorQueue: QueuedErrorEvent[] = []

let errorLogSink: ErrorLogSink | null = null

/**
 * Attach the error log sink that will receive all error events.
 * Queued events are drained immediately so no errors are lost.
 *
 * Idempotent: if a sink is already attached, this is a no-op.
 */
export function attachErrorLogSink(newSink: ErrorLogSink): void {
  if (errorLogSink !== null) {
    return
  }
  errorLogSink = newSink

  // Drain the queue
  if (errorQueue.length > 0) {
    const queuedEvents = [...errorQueue]
    errorQueue.length = 0

    for (const event of queuedEvents) {
      errorLogSink.logError(event.error)
    }
  }
}

// ---------------------------------------------------------------------------
// toError helper
// ---------------------------------------------------------------------------

function toError(error: unknown): Error {
  if (error instanceof Error) return error
  if (typeof error === 'string') return new Error(error)
  try {
    return new Error(JSON.stringify(error))
  } catch {
    return new Error(String(error))
  }
}

// ---------------------------------------------------------------------------
// logError — main entry point
// ---------------------------------------------------------------------------

/**
 * Log an error to the in-memory ring buffer and the attached sink (if any).
 * If no sink is attached yet, the event is queued and replayed later.
 */
export function logError(error: unknown): void {
  try {
    const err = toError(error)
    const errorStr = err.stack || err.message

    // Always record in memory
    addToInMemoryErrorLog({
      error: errorStr,
      timestamp: new Date().toISOString(),
    })

    // If sink not attached, queue the event
    if (errorLogSink === null) {
      errorQueue.push({ type: 'error', error: err })
      return
    }

    errorLogSink.logError(err)
  } catch {
    // Silently fail — never let logging crash the app
  }

  // Development mode: also print to stderr
  if (process.env.NODE_ENV === 'development') {
    console.error(error)
  }
}

// ---------------------------------------------------------------------------
// Testing helper
// ---------------------------------------------------------------------------

/**
 * Reset error log state for testing purposes only.
 * @internal
 */
export function _resetErrorLogForTesting(): void {
  errorLogSink = null
  errorQueue.length = 0
  inMemoryErrorLog.length = 0
}
