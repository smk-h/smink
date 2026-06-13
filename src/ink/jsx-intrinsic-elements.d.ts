import type { Styles, TextStyles } from './styles.js'

// Base props for all Ink host elements
type InkBaseProps = Styles & {
  children?: any
  style?: any
}

type InkTextBaseProps = TextStyles & {
  children?: any
  style?: any
  textStyles?: any
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'ink-box': InkBaseProps & { [key: string]: any }
      'ink-text': InkTextBaseProps & { [key: string]: any }
      'ink-link': { children?: any; href?: string; [key: string]: any }
      'ink-newline': { [key: string]: any }
      'ink-raw-ansi': { children?: any; [key: string]: any }
    }
  }
}
