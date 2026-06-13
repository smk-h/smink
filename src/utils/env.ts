/**
 * Environment detection utilities for the smink framework.
 *
 * Ported from Claude Code's env module, keeping TUI-relevant parts:
 * - Comprehensive terminal detection (30+ terminals)
 * - Platform, architecture, and Node version
 * - SSH session detection
 * - WSL environment detection
 * - CI environment detection
 *
 */

import { existsSync } from 'fs'
import { isEnvTruthy } from './envUtils.js'

type Platform = 'win32' | 'darwin' | 'linux'

export const JETBRAINS_IDES = [
  'pycharm',
  'intellij',
  'webstorm',
  'phpstorm',
  'rubymine',
  'clion',
  'goland',
  'rider',
  'datagrip',
  'appcode',
  'dataspell',
  'aqua',
  'gateway',
  'fleet',
  'jetbrains',
  'androidstudio',
]

// Detect terminal type with fallbacks for all platforms
function detectTerminal(): string | null {
  if (process.env.CURSOR_TRACE_ID) return 'cursor'
  // Cursor and Windsurf under WSL have TERM_PROGRAM=vscode
  if (process.env.VSCODE_GIT_ASKPASS_MAIN?.includes('cursor')) {
    return 'cursor'
  }
  if (process.env.VSCODE_GIT_ASKPASS_MAIN?.includes('windsurf')) {
    return 'windsurf'
  }
  if (process.env.VSCODE_GIT_ASKPASS_MAIN?.includes('antigravity')) {
    return 'antigravity'
  }
  const bundleId = process.env.__CFBundleIdentifier?.toLowerCase()
  if (bundleId?.includes('vscodium')) return 'codium'
  if (bundleId?.includes('windsurf')) return 'windsurf'
  if (bundleId?.includes('com.google.android.studio')) return 'androidstudio'
  // Check for JetBrains IDEs in bundle ID
  if (bundleId) {
    for (const ide of JETBRAINS_IDES) {
      if (bundleId.includes(ide)) return ide
    }
  }

  if (process.env.VisualStudioVersion) {
    // This is desktop Visual Studio, not VS Code
    return 'visualstudio'
  }

  // Check for JetBrains terminal on Linux/Windows
  if (process.env.TERMINAL_EMULATOR === 'JetBrains-JediTerm') {
    // For macOS, bundle ID detection above already handles JetBrains IDEs
    if (process.platform === 'darwin') return 'pycharm'

    // For finegrained detection on Linux/Windows use envDynamic.getTerminalWithJetBrainsDetection()
    return 'pycharm'
  }

  // Check for specific terminals by TERM before TERM_PROGRAM
  // This handles cases where TERM and TERM_PROGRAM might be inconsistent
  if (process.env.TERM === 'xterm-ghostty') {
    return 'ghostty'
  }
  if (process.env.TERM?.includes('kitty')) {
    return 'kitty'
  }

  if (process.env.TERM_PROGRAM) {
    return process.env.TERM_PROGRAM
  }

  if (process.env.TMUX) return 'tmux'
  if (process.env.STY) return 'screen'

  // Check for terminal-specific environment variables (common on Linux)
  if (process.env.KONSOLE_VERSION) return 'konsole'
  if (process.env.GNOME_TERMINAL_SERVICE) return 'gnome-terminal'
  if (process.env.XTERM_VERSION) return 'xterm'
  if (process.env.VTE_VERSION) return 'vte-based'
  if (process.env.TERMINATOR_UUID) return 'terminator'
  if (process.env.KITTY_WINDOW_ID) {
    return 'kitty'
  }
  if (process.env.ALACRITTY_LOG) return 'alacritty'
  if (process.env.TILIX_ID) return 'tilix'

  // Windows-specific detection
  if (process.env.WT_SESSION) return 'windows-terminal'
  if (process.env.SESSIONNAME && process.env.TERM === 'cygwin') return 'cygwin'
  if (process.env.MSYSTEM) return process.env.MSYSTEM.toLowerCase() // MINGW64, MSYS2, etc.
  if (
    process.env.ConEmuANSI ||
    process.env.ConEmuPID ||
    process.env.ConEmuTask
  ) {
    return 'conemu'
  }

  // WSL detection
  if (process.env.WSL_DISTRO_NAME) return `wsl-${process.env.WSL_DISTRO_NAME}`

  // SSH session detection
  if (isSSHSession()) {
    return 'ssh-session'
  }

  // Fall back to TERM which is more universally available
  // Special case for common terminal identifiers in TERM
  if (process.env.TERM) {
    const term = process.env.TERM
    if (term.includes('alacritty')) return 'alacritty'
    if (term.includes('rxvt')) return 'rxvt'
    if (term.includes('termite')) return 'termite'
    return process.env.TERM
  }

  // Detect non-interactive environment
  if (!process.stdout.isTTY) return 'non-interactive'

  return null
}

// all of these should be immutable
function isSSHSession(): boolean {
  return !!(
    process.env.SSH_CONNECTION ||
    process.env.SSH_CLIENT ||
    process.env.SSH_TTY
  )
}

/**
 * Checks if we're running in a WSL environment
 * @returns true if running in WSL, false otherwise
 */
function isWslEnvironment(): boolean {
  try {
    // Check for WSLInterop file which is a reliable indicator of WSL
    return existsSync('/proc/sys/fs/binfmt_misc/WSLInterop')
  } catch {
    // If there's an error checking, assume not WSL
    return false
  }
}

export const env = {
  isCI: isEnvTruthy(process.env.CI),
  platform: (['win32', 'darwin'].includes(process.platform)
    ? process.platform
    : 'linux') as Platform,
  arch: process.arch,
  nodeVersion: process.version,
  terminal: detectTerminal(),
  isSSH: isSSHSession,
  isWslEnvironment,
}
