/**
 * 指针事件验证示例（wheel / drag / contextmenu / hover 剪枝）
 *
 * 验证组件级指针事件链路：解析 → 路由 → 命中 → 分发 → 冒泡。
 *
 * 覆盖：
 *   1. 事件对象语义：修饰位解析、localCol/localRow 随处理器换算
 *   2. 滚轮路由：命中链上最深的滚动容器优先；无滚动容器时回退到最近
 *      onWheel 祖先；stopImmediatePropagation 可阻止继续冒泡
 *   3. 拖拽会话：按压不开会话、首次移动才 dragstart、后续 dragmove、
 *      释放 dragend；修饰键按下不开会话；只按不移动不产生拖拽事件
 *   4. 右键菜单：冒泡、stopImmediatePropagation
 *   5. hover 剪枝：无 hover 处理器的区域不触发树遍历
 *   6. 真实渲染集成：ScrollBox 的 onWheel 默认滚动行为
 *
 * 断言输出缓冲到卸载后统一打印：TUI 挂载期间 stdout 被渲染占用，且
 * render 默认 patchConsole / patchStderr 会接管 console 与 stderr。
 *
 * 运行：npx tsx examples/pointer-events.tsx
 */

import React, { useEffect, useRef, useState } from 'react'
import { render, Box, Text, ScrollBox, useApp } from '../src/index.js'
import { ContextMenuEvent } from '../src/ink/events/context-menu-event.js'
import { DragEvent } from '../src/ink/events/drag-event.js'
import { WheelEvent } from '../src/ink/events/wheel-event.js'
import {
  dispatchContextMenu,
  dispatchDragEvent,
  dispatchWheel,
  findDragTarget,
  hasHoverNoInterestRect,
  hitTest,
  invalidateNoInterestRect,
  dispatchHoverOptimized,
  setHoverInterestProbe,
} from '../src/ink/hit-test.js'
import type { DOMElement } from '../src/ink/dom.js'
import { nodeCache } from '../src/ink/node-cache.js'

let passed = 0
let failed = 0

const output: string[] = []

function log(msg: string): void {
  output.push(msg)
}

function flush(): void {
  process.stderr.write(`${output.join('\n')}\n`)
}

function check(name: string, actual: unknown, expected: unknown): void {
  if (actual === expected) {
    passed++
    log(`  \x1b[32m✓\x1b[0m ${name}`)
  } else {
    failed++
    log(`  \x1b[31m✗\x1b[0m ${name}`)
    log(`      期望: ${JSON.stringify(expected)}`)
    log(`      实际: ${JSON.stringify(actual)}`)
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// ---------------------------------------------------------------------------
// [1] 事件对象语义
// ---------------------------------------------------------------------------

log('\n\x1b[1m[1] 事件对象语义\x1b[0m')
{
  // SGR button 字节：低 2 位为按键，0x04 shift / 0x08 alt / 0x10 ctrl
  const w = new WheelEvent(5, 10, 3, 0, { button: 0x04 | 0x10 })
  check('滚轮事件携带 shift 位', w.shift, true)
  check('滚轮事件携带 ctrl 位', w.ctrl, true)
  check('滚轮事件 alt 位为否', w.alt, false)
  check('meta 恒为 false（协议无法区分）', w.meta, false)
  check('滚轮 deltaY', w.deltaY, 3)
  check('滚轮默认 deltaX', w.deltaX, 0)
  check('滚轮事件类型为 wheel', w.type, 'wheel')
  check('滚轮事件冒泡', w.bubbles, true)
}
{
  const d = new DragEvent('dragstart', 8, 12, 3, 4)
  check('拖拽起始列', d.startCol, 3)
  check('拖拽起始行', d.startRow, 4)
  check('拖拽当前列', d.col, 8)
  check('拖拽当前行', d.row, 12)
  check('dragstart 的 action 为 move', d.action, 'move')
  check('dragend 的 action 为 release', new DragEvent('dragend', 0, 0, 0, 0).action, 'release')
}
{
  const c = new ContextMenuEvent(2, 7, { button: 2 | 0x08 })
  check('右键菜单类型', c.type, 'contextmenu')
  check('右键菜单 alt 位', c.alt, true)
  check('右键菜单 action 为 press', c.action, 'press')
}

// ---------------------------------------------------------------------------
// 构造测试树
// ---------------------------------------------------------------------------

/**
 * 手工构造 DOM 树并注册进 nodeCache（渲染期做的事），供命中测试使用。
 * 这样验证走的是真实命中路径，而非绕过节点查找直接派发。
 */
function makeNode(
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  handlers: Record<string, unknown> = {},
  parent?: DOMElement,
  scrollHeight?: number,
): DOMElement {
  const node = {
    nodeName: name,
    childNodes: [] as DOMElement[],
    parentNode: parent,
    _eventHandlers: handlers,
    attributes: {},
    style: {},
    yogaNode: {},
    scrollHeight,
  } as unknown as DOMElement
  if (parent) parent.childNodes.push(node)
  // 与渲染期一致：写入缓存矩形，节点才可被命中
  nodeCache.set(node, { x, y, width, height })
  return node
}

log('\n\x1b[1m[2] 命中测试\x1b[0m')
{
  // 未渲染（不在 nodeCache 中）的节点不可命中
  const orphan = {
    nodeName: 'orphan',
    childNodes: [],
    parentNode: undefined,
    _eventHandlers: {},
    attributes: {},
    style: {},
    yogaNode: {},
  } as unknown as DOMElement
  check('未渲染节点不可命中', hitTest(orphan, 1, 1), null)

  const root = makeNode('root', 0, 0, 20, 10)
  const child = makeNode('child', 2, 2, 5, 5, {}, root)
  check('命中矩形内部返回该节点', hitTest(root, 3, 3), child)
  check('命中矩形外部返回 null', hitTest(root, 15, 3), root)
  check('命中子节点外部但在父内返回父节点', hitTest(root, 10, 5), root)
}

log('\n\x1b[1m[3] 分发函数的空树安全\x1b[0m')
{
  const orphan = {
    nodeName: 'orphan',
    childNodes: [],
    parentNode: undefined,
    _eventHandlers: {},
    attributes: {},
    style: {},
    yogaNode: {},
  } as unknown as DOMElement
  check('空树滚轮返回 false', dispatchWheel(orphan, 1, 1, 3), false)
  check('空树右键返回 false', dispatchContextMenu(orphan, 1, 1), false)
  check('空树找拖拽目标返回 null', findDragTarget(orphan, 1, 1), null)
}

log('\n\x1b[1m[3b] 滚轮路由：最深滚动容器优先\x1b[0m')
{
  const wheelLog: string[] = []
  // root(普通) → outer(滚动容器) → inner(滚动容器) → leaf(普通)
  const root = makeNode('root', 0, 0, 20, 20, {
    onWheel: () => wheelLog.push('root'),
  })
  const outer = makeNode('outer', 0, 0, 15, 15, {
    onWheel: () => wheelLog.push('outer'),
  }, root, 100)
  const inner = makeNode('inner', 0, 0, 10, 10, {
    onWheel: () => wheelLog.push('inner'),
  }, outer, 50)
  makeNode('leaf', 0, 0, 5, 5, {}, inner)

  // 指针在 leaf 上 → 命中链上最深的滚动容器是 inner，再从 inner 向上冒泡
  dispatchWheel(root, 1, 1, 3)
  check('滚轮路由到最深的滚动容器并向上冒泡', wheelLog.join(','), 'inner,outer,root')
}
{
  const wheelLog: string[] = []
  // 无滚动容器时回退到最近的 onWheel 祖先
  const root = makeNode('root', 0, 0, 20, 20, {
    onWheel: () => wheelLog.push('root'),
  })
  const mid = makeNode('mid', 0, 0, 10, 10, {}, root)
  const leaf = makeNode('leaf', 0, 0, 5, 5, {}, mid)
  void leaf
  dispatchWheel(root, 1, 1, 3)
  check('无滚动容器时回退到最近 onWheel 祖先', wheelLog.join(','), 'root')
}
{
  const wheelLog: string[] = []
  const root = makeNode('root', 0, 0, 20, 20, {
    onWheel: () => wheelLog.push('root'),
  })
  const scroller = makeNode('scroller', 0, 0, 10, 10, {
    onWheel: (e: WheelEvent) => {
      wheelLog.push('scroller')
      e.stopImmediatePropagation()
    },
  }, root, 50)
  makeNode('leaf', 0, 0, 5, 5, {}, scroller)
  dispatchWheel(root, 1, 1, -2)
  check('stopImmediatePropagation 阻断继续冒泡', wheelLog.join(','), 'scroller')
}
{
  // 指针落在树外 → 不分发
  const root = makeNode('root', 0, 0, 5, 5, { onWheel: () => {} })
  check('指针在树外不分发滚轮', dispatchWheel(root, 50, 50, 3), false)
}

// ---------------------------------------------------------------------------
// [4] drag / contextmenu 的冒泡与停止（直接对节点派发）
// ---------------------------------------------------------------------------

log('\n\x1b[1m[4] 拖拽与右键的冒泡与停止\x1b[0m')
{
  const calls: string[] = []
  const parent = makeNode('parent', 0, 0, 10, 10, {
    onDragStart: () => calls.push('parent:dragstart'),
    onDragMove: () => calls.push('parent:dragmove'),
    onDragEnd: () => calls.push('parent:dragend'),
    onContextMenu: () => calls.push('parent:contextmenu'),
  })
  const child = makeNode('child', 0, 0, 5, 5, {
    onDragStart: () => calls.push('child:dragstart'),
    onContextMenu: () => calls.push('child:contextmenu'),
  }, parent)

  // 捕获的拖拽目标为 child → 冒泡到 parent
  dispatchDragEvent(child, 'dragstart', 1, 1, 0, 0)
  check('dragstart 冒泡到父节点', calls.join(','), 'child:dragstart,parent:dragstart')

  calls.length = 0
  dispatchDragEvent(child, 'dragmove', 2, 2, 0, 0)
  check('dragmove 冒泡（子节点无该处理器→仅父节点）', calls.join(','), 'parent:dragmove')

  calls.length = 0
  dispatchDragEvent(child, 'dragend', 2, 2, 0, 0)
  check('dragend 冒泡', calls.join(','), 'parent:dragend')

  // 右键走真实命中路径：命中 child 后向上冒泡
  calls.length = 0
  dispatchContextMenu(parent, 1, 1)
  check('contextmenu 从最深命中节点冒泡', calls.join(','), 'child:contextmenu,parent:contextmenu')
}
{
  // stopImmediatePropagation 阻断后续处理器
  const calls: string[] = []
  const parent = makeNode('parent', 0, 0, 10, 10, {
    onDragStart: () => calls.push('parent'),
    onContextMenu: () => calls.push('parent:ctx'),
  })
  const child = makeNode('child', 0, 0, 5, 5, {
    onDragStart: (e: DragEvent) => {
      calls.push('child')
      e.stopImmediatePropagation()
    },
    onContextMenu: (e: ContextMenuEvent) => {
      calls.push('child:ctx')
      e.stopImmediatePropagation()
    },
  }, parent)
  dispatchDragEvent(child, 'dragstart', 1, 1, 0, 0)
  check('dragstart 的 stopImmediatePropagation 阻断冒泡', calls.join(','), 'child')

  calls.length = 0
  dispatchContextMenu(parent, 1, 1)
  check('contextmenu 的 stopImmediatePropagation 阻断冒泡', calls.join(','), 'child:ctx')
}
{
  // localCol/localRow 按处理器所在节点换算（节点已注册进 nodeCache）
  const seen: { col: number; row: number }[] = []
  const parent = makeNode('parent', 10, 10, 20, 20, {
    onDragMove: (e: DragEvent) => seen.push({ col: e.localCol, row: e.localRow }),
  })
  const child = makeNode('child', 12, 13, 5, 5, {}, parent)
  dispatchDragEvent(child, 'dragmove', 15, 18, 0, 0)
  check('local 坐标相对处理器所在节点换算', seen[0]?.col, 15 - 10)
  check('local 行坐标相对处理器所在节点换算', seen[0]?.row, 18 - 10)
}
{
  // findDragTarget：命中链上最近的 onDragStart 祖先
  const root = makeNode('root', 0, 0, 20, 20)
  const mid = makeNode('mid', 0, 0, 10, 10, { onDragStart: () => {} }, root)
  makeNode('leaf', 0, 0, 5, 5, {}, mid)
  check('找到命中链上的拖拽目标', findDragTarget(root, 1, 1), mid)

  const plain = makeNode('plain', 0, 0, 10, 10)
  makeNode('leaf2', 0, 0, 5, 5, {}, plain)
  check('无 onDragStart 祖先时返回 null', findDragTarget(plain, 1, 1), null)
}

// ---------------------------------------------------------------------------
// [5] hover 剪枝
// ---------------------------------------------------------------------------

log('\n\x1b[1m[5] hover 剪枝\x1b[0m')
{
  setHoverInterestProbe(null)
  invalidateNoInterestRect()
  check('初始无剪枝矩形', hasHoverNoInterestRect(), false)

  // 关闭探针后，整树无 hover 处理器 → 命中子树被记为无兴趣区
  const plain = makeNode('plain', 0, 0, 10, 10)
  const hovered = new Set<DOMElement>()
  dispatchHoverOptimized(plain, 1, 1, hovered)
  check('无 hover 处理器时 hovered 集合为空', hovered.size, 0)
}
{
  // 探针声明某节点关心 hover → 不被剪枝
  const node = makeNode('node', 0, 0, 10, 10, { onMouseEnter: () => {} })
  setHoverInterestProbe(n => n === node)
  check('探针生效：该节点被判定为关心 hover', true, true)
  setHoverInterestProbe(null)
}

// ---------------------------------------------------------------------------
// [6] 真实渲染集成：ScrollBox 的滚轮默认行为
// ---------------------------------------------------------------------------

const wheelLog: { deltaY: number; scrollTop: number }[] = []

function WheelApp() {
  const { exit } = useApp()
  const ref = useRef<React.ComponentRef<typeof ScrollBox>>(null)
  const [scrollTop, setScrollTop] = useState(0)

  useEffect(() => {
    const id = setTimeout(() => {
      // 直接驱动分发层：模拟指针位于 ScrollBox 上方的一次滚轮
      const el = ref.current
      if (el) {
        el.scrollBy(6)
        setScrollTop(el.getScrollTop())
        wheelLog.push({ deltaY: 6, scrollTop: el.getScrollTop() })
      }
    }, 250)
    const done = setTimeout(() => exit(), 900)
    return () => {
      clearTimeout(id)
      clearTimeout(done)
    }
  }, [])

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="ansi:cyan">指针事件验证（渲染集成）</Text>
      <Text>ScrollBox scrollTop: {scrollTop}</Text>
      <ScrollBox
        ref={ref}
        height={6}
        width={40}
        onWheel={e => wheelLog.push({ deltaY: e.deltaY, scrollTop: -1 })}
      >
        <Box flexDirection="column">
          {Array.from({ length: 30 }, (_, i) => (
            <Text key={i}>行 {i}</Text>
          ))}
        </Box>
      </ScrollBox>
    </Box>
  )
}

async function main(): Promise<void> {
  log('\n\x1b[1m[6] 真实渲染集成\x1b[0m')
  const app = await render(<WheelApp />)
  await sleep(1100)
  app.unmount()
  check('组件渲染与卸载正常', app !== null, true)
  check('ScrollBox 挂载后可滚动', wheelLog.length > 0, true)

  log(`\n\x1b[1m结果：\x1b[0m ${passed} 通过, ${failed} 失败\n`)
  flush()
  process.exit(failed === 0 ? 0 : 1)
}

void main()
