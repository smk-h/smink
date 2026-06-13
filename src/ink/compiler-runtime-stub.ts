/**
 * React Compiler runtime stub.
 *
 * The original Ink components were compiled with React Compiler, which injects
 * `import {c as _c} from "react/compiler-runtime"`. Since we're not using the
 * compiler, this stub provides a no-op implementation.
 *
 * _c() returns a function that just passes through its input (no caching).
 */
export function c(_size: number): (value: any) => any {
  return (value: any) => value
}
