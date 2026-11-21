/** What GET /config/version reports about the running API. */
export type APIVersion = { version: string | null; commit: string | null }

/**
 * The commit this frontend was built from: `VITE_DAMNIT_COMMIT` at build
 * time (`hzdr/scripts/next-on-server.sh` sets it). Empty when the build did
 * not set it, and then no mismatch is reported.
 */
export function frontendCommit(): string {
  return (import.meta.env.VITE_DAMNIT_COMMIT ?? '').trim()
}

/** True only when both commits are known and differ. */
export function commitsDiffer(built: string, api: string | null | undefined) {
  if (!built || !api) return false
  const n = Math.min(built.length, api.length)
  return built.slice(0, n) !== api.slice(0, n)
}

let request: Promise<APIVersion | null> | undefined

/** One request per page load; later callers share its answer. */
export function loadAPIVersion(): Promise<APIVersion | null> {
  request ??= fetch('/config/version')
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null)
  return request
}

export function resetAPIVersionForTests() {
  request = undefined
}
