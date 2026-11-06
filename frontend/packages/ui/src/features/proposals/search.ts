// Search for the proposals page. Instrument names at the start of the query
// filter by instrument, e.g. "mid smith" shows MID proposals matching "smith".
// The remaining words are matched against the proposal number, PI and title.
// Matching is case-insensitive.

export type ProposalQuery = {
  // Upper-case
  instruments: string[]
  // As typed, all of them must match
  terms: string[]
}

export type SearchableProposal = {
  number: number
  instrument: string
  principal_investigator: string
  title?: string | null
}

// `instruments` are the upper-case names to recognise.
export function parseQuery(
  query: string,
  instruments: readonly string[]
): ProposalQuery {
  const words = query.split(/\s+/).filter((word) => word !== '')

  let leading = 0
  while (
    leading < words.length &&
    instruments.includes(words[leading].toUpperCase())
  ) {
    leading += 1
  }

  return {
    instruments: [
      ...new Set(words.slice(0, leading).map((word) => word.toUpperCase())),
    ],
    terms: words.slice(leading),
  }
}

export function matchesQuery(
  proposal: SearchableProposal,
  { instruments, terms }: ProposalQuery
) {
  if (
    instruments.length > 0 &&
    !instruments.includes(proposal.instrument.toUpperCase())
  ) {
    return false
  }

  const text =
    `${proposal.number} ${proposal.principal_investigator} ${proposal.title ?? ''}`.toLowerCase()
  return terms.every((term) => text.includes(term.toLowerCase()))
}

// Add or remove an instrument from the start of the query. If there are no
// other words a trailing space is added so the user can keep typing.
export function toggleInstrument(
  { instruments, terms }: ProposalQuery,
  instrument: string
) {
  const next = instruments.includes(instrument)
    ? instruments.filter((name) => name !== instrument)
    : [...instruments, instrument]

  if (terms.length === 0) {
    return next.length === 0 ? '' : `${next.join(' ')} `
  }
  return [...next, ...terms].join(' ')
}

// "MID", "MID and SCS", "MID, SCS, and SPB".
export function listInstruments(instruments: string[]) {
  if (instruments.length <= 2) {
    return instruments.join(' and ')
  }
  return `${instruments.slice(0, -1).join(', ')}, and ${instruments[instruments.length - 1]}`
}
