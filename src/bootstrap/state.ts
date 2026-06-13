/**
 * Bootstrap state for the smink framework.
 *
 * Adapted from Claude Code's bootstrap/state.ts. Only the TUI-relevant subset
 * is included: interaction time tracking and scroll drain suspension.
 * Claude Code specific state (session IDs, cost tracking, telemetry, hooks,
 * plugins, model management, etc.) is omitted.
 */

// ---------------------------------------------------------------------------
// Interaction time tracking
// ---------------------------------------------------------------------------

let lastInteractionTime = Date.now()

/**
 * Dirty flag: set by updateLastInteractionTime(), cleared by flushInteractionTime().
 * Batches many keypresses into a single Date.now() call per Ink render frame.
 */
let interactionTimeDirty = false

/**
 * If an interaction was recorded since the last flush, update the timestamp now.
 * Called by Ink before each render cycle so we batch many keypresses into
 * a single Date.now() call instead of calling it on every keystroke.
 */
export function flushInteractionTime(): void {
  if (interactionTimeDirty) {
    lastInteractionTime = Date.now()
    interactionTimeDirty = false
  }
}

/**
 * Marks that an interaction occurred.
 *
 * By default the actual Date.now() call is deferred until the next Ink render
 * frame (via flushInteractionTime()) so we avoid calling Date.now() on every
 * single keypress.
 *
 * Pass `immediate = true` when calling from React useEffect callbacks or
 * other code that runs *after* the Ink render cycle has already flushed.
 * Without it the timestamp stays stale until the next render, which may never
 * come if the user is idle (e.g. permission dialog waiting for input).
 */
export function updateLastInteractionTime(immediate?: boolean): void {
  if (immediate) {
    lastInteractionTime = Date.now()
    interactionTimeDirty = false
  } else {
    interactionTimeDirty = true
  }
}

/**
 * Get the last interaction timestamp.
 */
export function getLastInteractionTime(): number {
  return lastInteractionTime
}

// ---------------------------------------------------------------------------
// Scroll drain suspension
// ---------------------------------------------------------------------------

/**
 * Background intervals check this before doing work so they don't compete
 * with scroll frames for the event loop. Set by ScrollBox scrollBy/scrollTo,
 * cleared SCROLL_DRAIN_IDLE_MS after the last scroll event.
 * Module-scope (not in STATE) — ephemeral hot-path flag, no test-reset needed
 * since the debounce timer self-clears.
 */
let scrollDraining = false
let scrollDrainTimer: ReturnType<typeof setTimeout> | undefined
const SCROLL_DRAIN_IDLE_MS = 150

/**
 * Mark that a scroll event just happened. Background intervals gate on
 * getIsScrollDraining() and skip their work until the debounce clears.
 */
export function markScrollActivity(): void {
  scrollDraining = true
  if (scrollDrainTimer) clearTimeout(scrollDrainTimer)
  scrollDrainTimer = setTimeout(() => {
    scrollDraining = false
    scrollDrainTimer = undefined
  }, SCROLL_DRAIN_IDLE_MS)
  scrollDrainTimer.unref?.()
}

/**
 * True while scroll is actively draining (within 150ms of last event).
 * Intervals should early-return when this is set — the work picks up next
 * tick after scroll settles.
 */
export function getIsScrollDraining(): boolean {
  return scrollDraining
}

/**
 * Await this before expensive one-shot work (network, subprocess) that could
 * coincide with scroll. Resolves immediately if not scrolling; otherwise
 * polls at the idle interval until the flag clears.
 */
export async function waitForScrollIdle(): Promise<void> {
  while (scrollDraining) {
    await new Promise(r => setTimeout(r, SCROLL_DRAIN_IDLE_MS).unref?.())
  }
}

// ---------------------------------------------------------------------------
// Interactive mode detection
// ---------------------------------------------------------------------------

let isInteractive = !!process.stdin.isTTY

/**
 * Whether running in interactive REPL mode.
 */
export function getIsInteractive(): boolean {
  return isInteractive
}

/**
 * Whether running in non-interactive mode (piped stdin, -p flag, etc.).
 */
export function getIsNonInteractiveSession(): boolean {
  return !isInteractive
}

/**
 * Override the interactive mode detection. Called during startup after
 * argument parsing determines the actual mode.
 */
export function setIsInteractive(value: boolean): void {
  isInteractive = value
}
