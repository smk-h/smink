// Shared frame interval for render throttling and animations (~60fps)
export const FRAME_INTERVAL_MS = 16

/**
 * In-flight pty gate threshold (bytes) for scroll-drain frames — Grok
 * Build's Presenter in_flight gate. While stdout holds more unflushed
 * output than this, drain frames hold off instead of stacking latency
 * into a slow ConPTY/ssh link. Sized above one full-screen diff (~4KB at
 * 100 cols) so the gate only trips on genuine backlog, never on a single
 * in-transit frame.
 */
export const PTY_BACKLOG_BYTES = 8192

// How long to drop parsed input after stdin is handed back from an external
// TUI. Long enough to cover async terminal replies (a CPR/DECRPM round trip
// is a few ms even over a slow ssh hop), short enough that a keystroke typed
// the moment the editor closes is not swallowed.
export const STDIN_HANDOFF_SUPPRESSION_MS = 120
