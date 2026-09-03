/**
 * smink - A standalone TUI framework based on Ink (React for CLI).
 *
 * Extracted from Claude Code's deeply customized Ink runtime.
 * Features:
 *   - React-based terminal UI with Concurrent Mode
 *   - Pure TypeScript Yoga layout engine (no native dependencies)
 *   - Double-buffered diff rendering
 *   - Mouse tracking, text selection, scrolling
 *   - Kitty keyboard protocol support
 *   - Alt-screen support
 */

// Re-export render and createRoot (primary API)
export { default as render, renderSync, createRoot } from './ink/root.js'
export type { RenderOptions, Instance, Root } from './ink/root.js'

// Re-export core components
export { default as Box } from './ink/components/Box.js'
export type { Props as BoxProps } from './ink/components/Box.js'

export { default as Text } from './ink/components/Text.js'
export type { Props as TextProps } from './ink/components/Text.js'

export { default as Button } from './ink/components/Button.js'
export type { Props as ButtonProps, ButtonState } from './ink/components/Button.js'

export { default as Newline } from './ink/components/Newline.js'
export type { Props as NewlineProps } from './ink/components/Newline.js'

export { default as Spacer } from './ink/components/Spacer.js'

export { default as Link } from './ink/components/Link.js'
export type { Props as LinkProps } from './ink/components/Link.js'

export { NoSelect } from './ink/components/NoSelect.js'

export { RawAnsi } from './ink/components/RawAnsi.js'

export { Ansi } from './ink/Ansi.js'

export { default as ScrollBox } from './ink/components/ScrollBox.js'

export { AlternateScreen } from './ink/components/AlternateScreen.js'

// Re-export hooks
export { default as useApp } from './ink/hooks/use-app.js'
export { default as useInput } from './ink/hooks/use-input.js'
export { default as useStdin } from './ink/hooks/use-stdin.js'
export { useAnimationFrame } from './ink/hooks/use-animation-frame.js'
export { useAnimationTimer, useInterval } from './ink/hooks/use-interval.js'
export { useSelection } from './ink/hooks/use-selection.js'
export { useSearchHighlight } from './ink/hooks/use-search-highlight.js'
export { useDeclaredCursor } from './ink/hooks/use-declared-cursor.js'
export { useTabStatus } from './ink/hooks/use-tab-status.js'
export { useTerminalFocus } from './ink/hooks/use-terminal-focus.js'
export { useTerminalTitle } from './ink/hooks/use-terminal-title.js'
export { useTerminalSize } from './ink/hooks/use-terminal-size.js'
export { useCopyOnSelect } from './ink/hooks/use-copy-on-select.js'
export {
  callWithUpdateOverflowGuard,
  installNestedUpdateOverflowProcessGuard,
  isNestedUpdateOverflow,
  registerOverflowQuench,
  swallowNestedUpdateOverflow,
} from './ink/update-overflow-guard.js'
export { useTerminalViewport } from './ink/hooks/use-terminal-viewport.js'

// Re-export types
export type { DOMElement } from './ink/dom.js'
export type { Key } from './ink/events/input-event.js'
export type { FlickerReason, FrameEvent } from './ink/frame.js'

// Re-export events
export { EventEmitter } from './ink/events/emitter.js'
export { Event } from './ink/events/event.js'
export { ClickEvent } from './ink/events/click-event.js'
export { InputEvent } from './ink/events/input-event.js'
export { TerminalFocusEvent } from './ink/events/terminal-focus-event.js'
export type { TerminalFocusEventType } from './ink/events/terminal-focus-event.js'

// Re-export utilities
export { FocusManager } from './ink/focus.js'
export { default as measureElement } from './ink/measure-element.js'
export { supportsTabStatus } from './ink/termio/osc.js'
export { default as wrapText } from './ink/wrap-text.js'
export { truncateToWidth } from './ink/truncateToWidth.js'
export { getTerminalFlushTick, noteTerminalFlush } from './ink/flush-tick.js'
export {
  clearInputSuppression,
  isInputSuppressed,
  suppressInputFor,
} from './ink/input-suppression.js'
export {
  GEOMETRY_TRACE_ENABLED,
  noteAuxNumber,
  noteFrameCause,
  noteScrollGeometry,
  type FrameCause,
  type ScrollGeometryNote,
} from './ink/geometry-trace.js'
export {
  RAIL_MIN_TERMINAL_WIDTH,
  RAIL_MIN_TURNS,
  RAIL_WIDTH,
  clipPreview,
  computeRailGeometry,
  railEligible,
  railHit,
  wrapPreviewLines,
  type RailGeometry,
  type RailHit,
  type TimelineSnapshot,
  type TimelineTurn,
} from './ink/timeline-rail.js'
export { colorize } from './ink/colorize.js'

// Re-export contexts (all use default exports)
export { default as StdinContext } from './ink/components/StdinContext.js'
export type { Props as StdinProps } from './ink/components/StdinContext.js'

export { TerminalSizeContext } from './ink/components/TerminalSizeContext.js'
export type { TerminalSize } from './ink/components/TerminalSizeContext.js'

export { default as AppContext } from './ink/components/AppContext.js'
export type { Props as AppProps } from './ink/components/AppContext.js'

export { ClockProvider, ClockContext } from './ink/components/ClockContext.js'
