import type { DOMElement } from './dom.js'
import { ClickEvent } from './events/click-event.js'
import { ContextMenuEvent } from './events/context-menu-event.js'
import { DragEvent, type DragEventType } from './events/drag-event.js'
import type { EventHandlerProps } from './events/event-handlers.js'
import { WheelEvent } from './events/wheel-event.js'
import { nodeCache } from './node-cache.js'

/**
 * Find the deepest DOM element whose rendered rect contains (col, row).
 *
 * Uses the nodeCache populated by renderNodeToOutput — rects are in screen
 * coordinates with all offsets (including scrollTop translation) already
 * applied. Children are traversed in reverse so later siblings (painted on
 * top) win. Nodes not in nodeCache (not rendered this frame, or lacking a
 * yogaNode) are skipped along with their subtrees.
 *
 * Returns the hit node even if it has no onClick — dispatchClick walks up
 * via parentNode to find handlers.
 */
export function hitTest(
  node: DOMElement,
  col: number,
  row: number,
): DOMElement | null {
  const rect = nodeCache.get(node)
  if (!rect) return null
  if (
    col < rect.x ||
    col >= rect.x + rect.width ||
    row < rect.y ||
    row >= rect.y + rect.height
  ) {
    return null
  }
  // Later siblings paint on top; reversed traversal returns topmost hit.
  for (let i = node.childNodes.length - 1; i >= 0; i--) {
    const child = node.childNodes[i]!
    if (child.nodeName === '#text') continue
    const hit = hitTest(child, col, row)
    if (hit) return hit
  }
  return node
}

/** Walk up from `node` looking for a handler prop in `_eventHandlers`. */
function findHandlerAncestor(
  node: DOMElement | undefined,
  prop: keyof EventHandlerProps,
): DOMElement | undefined {
  let n: DOMElement | undefined = node
  while (n) {
    const handlers = n._eventHandlers as EventHandlerProps | undefined
    if (handlers?.[prop]) return n
    n = n.parentNode
  }
  return undefined
}

/**
 * Hit-test the root at (col, row) and bubble a ClickEvent from the deepest
 * containing node up through parentNode. Only nodes with an onClick handler
 * fire. Stops when a handler calls stopImmediatePropagation(). Returns
 * true if at least one onClick handler fired.
 */
export function dispatchClick(
  root: DOMElement,
  col: number,
  row: number,
  cellIsBlank = false,
): boolean {
  let target: DOMElement | undefined = hitTest(root, col, row) ?? undefined
  if (!target) return false

  // Click-to-focus: find the closest focusable ancestor and focus it.
  // root is always ink-root, which owns the FocusManager.
  if (root.focusManager) {
    let focusTarget: DOMElement | undefined = target
    while (focusTarget) {
      if (typeof focusTarget.attributes['tabIndex'] === 'number') {
        root.focusManager.handleClickFocus(focusTarget)
        break
      }
      focusTarget = focusTarget.parentNode
    }
  }
  const event = new ClickEvent(col, row, cellIsBlank)
  let handled = false
  while (target) {
    const handler = target._eventHandlers?.onClick as
      | ((event: ClickEvent) => void)
      | undefined
    if (handler) {
      handled = true
      const rect = nodeCache.get(target)
      if (rect) {
        event.localCol = col - rect.x
        event.localRow = row - rect.y
      }
      handler(event)
      if (event.didStopImmediatePropagation()) return true
    }
    target = target.parentNode
  }
  return handled
}

/**
 * Fire onMouseEnter/onMouseLeave as the pointer moves. Like DOM
 * mouseenter/mouseleave: does NOT bubble — moving between children does
 * not re-fire on the parent. Walks up from the hit node collecting every
 * ancestor with a hover handler; diffs against the previous hovered set;
 * fires leave on the nodes exited, enter on the nodes entered.
 *
 * Mutates `hovered` in place so the caller (App instance) can hold it
 * across calls. Clears the set when the hit is null (cursor moved into a
 * non-rendered gap or off the root rect).
 */
export function dispatchHover(
  root: DOMElement,
  col: number,
  row: number,
  hovered: Set<DOMElement>,
): void {
  const next = new Set<DOMElement>()
  let node: DOMElement | undefined = hitTest(root, col, row) ?? undefined
  while (node) {
    const h = node._eventHandlers as EventHandlerProps | undefined
    if (h?.onMouseEnter || h?.onMouseLeave) next.add(node)
    node = node.parentNode
  }
  for (const old of hovered) {
    if (!next.has(old)) {
      hovered.delete(old)
      // Skip handlers on detached nodes (removed between mouse events)
      if (old.parentNode) {
        ;(old._eventHandlers as EventHandlerProps | undefined)?.onMouseLeave?.()
      }
    }
  }
  for (const n of next) {
    if (!hovered.has(n)) {
      hovered.add(n)
      ;(n._eventHandlers as EventHandlerProps | undefined)?.onMouseEnter?.()
    }
  }
}

// ---------------------------------------------------------------------------
// Hover-interest pruning
// ---------------------------------------------------------------------------

type NoInterestRect = { x: number; y: number; width: number; height: number }

/**
 * Optional probe the app installs to declare which nodes care about hover.
 * Without one, every node is treated as potentially interested (correct,
 * but no pruning).
 */
let hoverInterestProbe: ((node: DOMElement) => boolean) | null = null

/** Cached "no subtree here handles hover" rect, invalidated per render. */
let noInterestRect: NoInterestRect | null = null

export function setHoverInterestProbe(
  probe: ((node: DOMElement) => boolean) | null,
): void {
  hoverInterestProbe = probe
}

/** Drop the cached no-interest rect. Called at the start of each render. */
export function invalidateNoInterestRect(): void {
  noInterestRect = null
}

function hasHoverInterest(node: DOMElement): boolean {
  const h = node._eventHandlers as EventHandlerProps | undefined
  return Boolean(h?.onMouseEnter || h?.onMouseLeave)
}

function subtreeHasHoverInterest(node: DOMElement): boolean {
  if (hoverInterestProbe?.(node) === true) return true
  if (hasHoverInterest(node)) return true
  for (const child of node.childNodes) {
    if (child.nodeName === '#text') continue
    if (subtreeHasHoverInterest(child)) return true
  }
  return false
}

function rectsOverlap(left: NoInterestRect, right: NoInterestRect): boolean {
  return (
    left.x < right.x + right.width &&
    right.x < left.x + left.width &&
    left.y < right.y + right.height &&
    right.y < left.y + left.height
  )
}

/**
 * Fast path for hover dispatch: if the pointer is inside a previously
 * computed "nothing here handles hover" rect, and that rect still holds,
 * skip the whole tree walk. Pointer motion is the highest-frequency input
 * stream (every mouse-move packet), so avoiding the walk matters.
 */
function dispatchHoverFastPath(col: number, row: number): boolean {
  const cached = noInterestRect
  if (!cached) return false
  if (
    col < cached.x ||
    col >= cached.x + cached.width ||
    row < cached.y ||
    row >= cached.y + cached.height
  ) {
    return false
  }
  return true
}

/** Record the pointer region that has no hover handlers at all. */
function rememberNoInterest(rect: NoInterestRect): void {
  noInterestRect = rect
}

// ---------------------------------------------------------------------------
// Wheel
// ---------------------------------------------------------------------------

/**
 * Dispatch a wheel event to the DEEPEST scroll container under the pointer.
 *
 * Routing rule: walk up from the hit node and pick the first node that is a
 * scroll container (has scrollHeight set, i.e. a ScrollBox) — nested
 * scrollables then behave like the DOM, where the innermost one under the
 * cursor consumes the wheel. If no ancestor is a scroll container, fall back
 * to the nearest ancestor with an onWheel handler so plain containers can
 * still observe wheel input.
 *
 * Returns true if at least one onWheel handler fired.
 */
export function dispatchWheel(
  root: DOMElement,
  col: number,
  row: number,
  deltaY: number,
  deltaX = 0,
  button = 0,
): boolean {
  const hit = hitTest(root, col, row)
  if (!hit) return false

  // Prefer the deepest scroll container (innermost-wins, like DOM wheel).
  let scrollTarget: DOMElement | undefined = hit
  while (scrollTarget) {
    if (scrollTarget.scrollHeight !== undefined) break
    scrollTarget = scrollTarget.parentNode
  }
  const target = scrollTarget ?? findHandlerAncestor(hit, 'onWheel')
  if (!target) return false

  const event = new WheelEvent(col, row, deltaY, deltaX, { button })
  let node: DOMElement | undefined = target
  let handled = false
  while (node) {
    const handler = node._eventHandlers?.onWheel as
      | ((event: WheelEvent) => void)
      | undefined
    if (handler) {
      handled = true
      // PointerEvent._prepareForTarget refreshes localCol/localRow.
      event._prepareForTarget(node)
      handler(event)
      if (event.didStopImmediatePropagation()) return true
    }
    node = node.parentNode
  }
  return handled
}

// ---------------------------------------------------------------------------
// Context menu
// ---------------------------------------------------------------------------

/**
 * Dispatch a context-menu event on right-button press. Bubbles from the
 * deepest hit node up through parentNode, so a handler can anchor a popup
 * menu at the pointer. Returns true if any onContextMenu handler fired.
 */
export function dispatchContextMenu(
  root: DOMElement,
  col: number,
  row: number,
  button = 2,
): boolean {
  let target: DOMElement | undefined = hitTest(root, col, row) ?? undefined
  if (!target) return false

  const event = new ContextMenuEvent(col, row, { button })
  let handled = false
  while (target) {
    const handler = target._eventHandlers?.onContextMenu as
      | ((event: ContextMenuEvent) => void)
      | undefined
    if (handler) {
      handled = true
      event._prepareForTarget(target)
      handler(event)
      if (event.didStopImmediatePropagation()) return true
    }
    target = target.parentNode
  }
  return handled
}

// ---------------------------------------------------------------------------
// Drag
// ---------------------------------------------------------------------------

/**
 * Find the drag target for a press at (col, row): the closest ancestor of
 * the hit node carrying an onDragStart handler. Returns null when nothing in
 * the chain wants drags (so no session opens and the press stays a plain
 * click / text-selection gesture).
 */
export function findDragTarget(
  root: DOMElement,
  col: number,
  row: number,
): DOMElement | null {
  const hit = hitTest(root, col, row)
  if (!hit) return null
  return findHandlerAncestor(hit, 'onDragStart') ?? null
}

/**
 * Dispatch a drag event to the captured target and its ancestors.
 *
 * The target is captured at press time, so motion keeps going to it even
 * after the pointer leaves its rect (DOM element-capture semantics). Returns
 * true if any drag handler fired.
 */
export function dispatchDragEvent(
  target: DOMElement,
  type: DragEventType,
  col: number,
  row: number,
  startCol: number,
  startRow: number,
  button = 0,
): boolean {
  const event = new DragEvent(type, col, row, startCol, startRow, { button })
  let node: DOMElement | undefined = target
  let handled = false
  const prop =
    type === 'dragstart'
      ? 'onDragStart'
      : type === 'dragmove'
        ? 'onDragMove'
        : 'onDragEnd'
  while (node) {
    const handler = node._eventHandlers?.[prop] as
      | ((event: DragEvent) => void)
      | undefined
    if (handler) {
      handled = true
      event._prepareForTarget(node)
      handler(event)
      if (event.didStopImmediatePropagation()) return true
    }
    node = node.parentNode
  }
  return handled
}

/**
 * Clear hover state (e.g. when the pointer leaves the terminal or drag
 * capture takes over). Fires onMouseLeave on everything currently hovered.
 */
export function clearHovered(hovered: Set<DOMElement>): void {
  for (const node of hovered) {
    if (node.parentNode) {
      ;(node._eventHandlers as EventHandlerProps | undefined)?.onMouseLeave?.()
    }
  }
  hovered.clear()
}

/**
 * Hover dispatch with the no-interest fast path.
 *
 * When the pointer sits inside a region where no node handles hover at all
 * — the overwhelmingly common case — the tree walk is skipped entirely.
 * The rect is recomputed and cached whenever the pointer leaves it.
 */
export function dispatchHoverOptimized(
  root: DOMElement,
  col: number,
  row: number,
  hovered: Set<DOMElement>,
): void {
  if (dispatchHoverFastPath(col, row)) {
    // Nothing under the pointer cares about hover; hovered is already empty.
    return
  }

  const hit = hitTest(root, col, row)
  if (hit && !subtreeHasHoverInterest(hit)) {
    // Cache the whole hit subtree's rect as a no-interest zone. Ancestors
    // could still have handlers, but they are only reachable through this
    // subtree — if it has none, and it fully covers the pointer, no
    // ancestor can receive a hover either (hit-testing is topmost-wins).
    const rect = nodeCache.get(hit)
    if (rect) rememberNoInterest(rect)
    clearHovered(hovered)
    return
  }

  dispatchHover(root, col, row, hovered)
}

/** Test/telemetry seam: whether the hover fast path is currently armed. */
export function hasHoverNoInterestRect(): boolean {
  return noInterestRect !== null
}
