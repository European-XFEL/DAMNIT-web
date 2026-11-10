// The page size for asking the server for every run at once, for the plots
// that chart a variable across the whole proposal rather than a table page.
export const ALL_RUNS_PAGE_SIZE = 10000

// Proposals already reported, so each summary plot does not warn about the
// same cap again.
const warned = new Set<string>()

// The summary plots ask for every run in one page, so a full page back means
// anything past the cap is missing.
export function warnIfRunsTruncated(proposal: string, count: number): void {
  if (count < ALL_RUNS_PAGE_SIZE || warned.has(proposal)) {
    return
  }

  warned.add(proposal)
  // The cap rather than the count, and "may be": a count alone cannot tell an
  // exact fit from a truncation.
  console.warn(
    `Loaded ${ALL_RUNS_PAGE_SIZE} runs for proposal ${proposal}, the most a ` +
      `single request returns. Runs past that may be missing from the ` +
      `summary plots.`
  )
}

// Leaving a proposal drops its cached runs, so the next visit loads them again
// and has to hear about the cap again.
export function forgetRunsTruncation(proposal: string): void {
  warned.delete(proposal)
}
