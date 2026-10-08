const FIRST_RETRY_DELAY = 1000
const LONGEST_RETRY_DELAY = 30_000

// Milliseconds to wait before reconnecting. `retries` is 0 on the first try
// after a drop.
export function retryDelay(retries: number): number {
  return Math.min(FIRST_RETRY_DELAY * 2 ** retries, LONGEST_RETRY_DELAY)
}
