/**
 * Early Input Capture
 *
 * Captures terminal input typed before the TUI is fully initialized.
 * Can be replaced with your own implementation if needed.
 */

let earlyInputBuffer = ''
let isCapturing = false

export function startCapturingEarlyInput(): void {
  if (!process.stdin.isTTY || isCapturing) return
  isCapturing = true
  earlyInputBuffer = ''
}

export function stopCapturingEarlyInput(): void {
  isCapturing = false
}

export function consumeEarlyInput(): string {
  stopCapturingEarlyInput()
  const input = earlyInputBuffer.trim()
  earlyInputBuffer = ''
  return input
}

export function hasEarlyInput(): boolean {
  return earlyInputBuffer.trim().length > 0
}

export function seedEarlyInput(text: string): void {
  earlyInputBuffer = text
}

export function isCapturingEarlyInput(): boolean {
  return isCapturing
}
