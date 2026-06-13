/**
 * Execute file without throwing - simplified stub for smink.
 *
 * The original uses execa. Replace with your own implementation if needed.
 */

import { execFile } from 'child_process'

type ExecFileOptions = {
  timeout?: number
  useCwd?: boolean
  input?: string
  env?: NodeJS.ProcessEnv
}

export function execFileNoThrow(
  file: string,
  args: string[],
  options: ExecFileOptions = {},
): Promise<{ stdout: string; stderr: string; code: number; error?: string }> {
  return new Promise(resolve => {
    const child = execFile(file, args, { timeout: options.timeout, encoding: 'utf8', env: options.env }, (error, stdout, stderr) => {
      if (error) {
        const code = typeof error.code === 'string' ? 1 : (error.code as number ?? 1)
        resolve({
          stdout: stdout || '',
          stderr: stderr || '',
          code,
          error: error.message,
        })
      } else {
        resolve({ stdout: stdout || '', stderr: stderr || '', code: 0 })
      }
    })
    if (options.input && child.stdin) {
      child.stdin.write(options.input)
      child.stdin.end()
    }
  })
}
