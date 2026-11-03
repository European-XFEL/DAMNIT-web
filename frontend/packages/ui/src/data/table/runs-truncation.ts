import { ALL_RUNS_PAGE_SIZE } from './table-data.constants'

// Proposals already reported, so the table and the summary plots do not each
// warn about the same cap.
const warned = new Set<string>()

// The unpaginated table and the summary plots ask for every run in one page, so
// a full page back means anything past the cap is missing.
export function warnIfRunsTruncated(proposal: string, count: number): void {
  if (count < ALL_RUNS_PAGE_SIZE || warned.has(proposal)) {
    return
  }

  warned.add(proposal)
  // The cap rather than the count, and "may be": a count alone cannot tell an
  // exact fit from a truncation.
  console.warn(
    `Loaded ${ALL_RUNS_PAGE_SIZE} runs for proposal ${proposal}, the most a ` +
      `single request returns. Runs past that may be missing from the table ` +
      `and summary plots.`
  )
}

// Leaving a proposal drops its cached runs, so the next visit loads them again
// and has to hear about the cap again.
export function forgetRunsTruncation(proposal: string): void {
  warned.delete(proposal)
}
