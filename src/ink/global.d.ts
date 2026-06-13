// Global type declarations for Ink
declare module '*.md' {
  const content: string
  export default content
}
declare module '*.txt' {
  const content: string
  export default content
}

// React Compiler runtime stub
// The original code was compiled with React Compiler which injects `import {c as _c} from "react/compiler-runtime"`
// We replace _c with a no-op function that returns an identity function
declare function _c(size: number): (value: any) => any
