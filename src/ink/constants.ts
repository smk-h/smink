// Shared frame interval for render throttling and animations (~60fps)
export const FRAME_INTERVAL_MS = 16

// How long to drop parsed input after stdin is handed back from an external
// TUI. Long enough to cover async terminal replies (a CPR/DECRPM round trip
// is a few ms even over a slow ssh hop), short enough that a keystroke typed
// the moment the editor closes is not swallowed.
export const STDIN_HANDOFF_SUPPRESSION_MS = 120
