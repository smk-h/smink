import wrapAnsiNpm from 'wrap-ansi'

type WrapAnsiOptions = {
  hard?: boolean
  wordWrap?: boolean
  trim?: boolean
}

const _globalThis = typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : {}) as any
const wrapAnsiBun =
  typeof _globalThis.Bun !== 'undefined' && typeof _globalThis.Bun.wrapAnsi === 'function'
    ? _globalThis.Bun.wrapAnsi
    : null

const wrapAnsi: (
  input: string,
  columns: number,
  options?: WrapAnsiOptions,
) => string = wrapAnsiBun ?? wrapAnsiNpm

export { wrapAnsi }
