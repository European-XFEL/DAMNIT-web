import type {
  FieldFunctionOptions,
  Reference,
  StoreObject,
  TypePolicies,
} from '@apollo/client'

import { isHeavySummaryBlank } from '#src/constants'

// Accumulate normalized refs into one list, deduped by Apollo's own cache id
// (`__ref`), the identity it already computed from keyFields. When nothing new
// arrives this hands back the same array: a value-only push carries only refs
// already present, so keeping the field's reference lets Apollo skip a needless
// re-broadcast (and the Map rebuild that rides on it).
function mergeRefsByIdentity(
  existing: readonly Reference[] = [],
  incoming: readonly Reference[] = []
): Reference[] {
  const seen = new Set(existing.map((ref) => ref.__ref))
  const additions: Reference[] = []

  for (const ref of incoming) {
    if (seen.has(ref.__ref)) {
      continue
    }
    seen.add(ref.__ref)
    additions.push(ref)
  }

  if (additions.length === 0) {
    return existing as Reference[]
  }
  return [...existing, ...additions]
}

// A summary as the cache stores it. Every runs document selects the summary
// through the one `CELL_FIELDS` constant, so both fields always arrive.
type StoredSummary = StoreObject & {
  value: unknown
  dtype: string
}

// Keep a value the lightweight pass is holding back. Only a heavy dtype is ever
// blanked, so a null arriving over a value of that same dtype is a blank on its
// way to being filled, and the cached value stays. Everything else is DAMNIT's
// own answer and replaces what is there: a null scalar clears a stale number,
// and a retyped variable clears a value that no longer describes it.
function mergeSummary(
  existing: StoredSummary | undefined,
  incoming: StoredSummary,
  { mergeObjects }: FieldFunctionOptions
): StoredSummary {
  if (existing == null) {
    return incoming
  }

  const heldBackBlank =
    existing.value != null &&
    incoming.dtype === existing.dtype &&
    isHeavySummaryBlank(incoming)
  return heldBackBlank ? existing : mergeObjects(existing, incoming)
}

export const typePolicies: TypePolicies = {
  DamnitRun: {
    keyFields: ['database', 'proposal', 'run'],
    fields: {
      // Cell refs, one list per run. Both table passes write to the same
      // normalized cells, so this list only owes membership: without it the
      // deferred pass's shorter array would drop the cells it did not carry.
      cells: {
        keyArgs: false,
        merge: mergeRefsByIdentity,
      },
    },
  },
  Cell: {
    keyFields: ['id'],
  },
  CellSummary: {
    // The value guard lives here rather than on `Cell` because a merge function
    // only sees the field it merges, so this is the only level that can see
    // `dtype` alongside the value. `error` is cell-level and unreadable from
    // here, which is why the API drops a failed cell's summary type instead
    // (`DamnitRun._iter_cells`).
    //
    // Declaring any merge here costs one entry in Apollo's `storageTrie` per
    // cell, held by a strong Map that `gc`, `evict` and `resetResultCache` all
    // leave alone. It is the price of normalizing `Cell`: two documents write
    // the same field with different completeness, so something has to arbitrate.
    merge: mergeSummary,
  },
  Query: {
    fields: {
      // Paginated runs, one list. Row order is not preserved here: the table
      // lays out rows from the server-ordered `metadata.runs` and looks up each
      // run's values by identity, so the only thing this list owes is
      // membership.
      runs: {
        keyArgs: ['database'],
        merge: mergeRefsByIdentity,
      },
    },
  },
}
