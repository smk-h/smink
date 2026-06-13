/**
 * Stub for error logging - replace with your own implementation if needed.
 */
export function logError(error: unknown): void {
  // No-op by default. Override or replace with your logging solution.
  if (process.env.NODE_ENV === 'development') {
    console.error(error)
  }
}
