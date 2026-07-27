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

// A summary as the cache stores it. Both fields are optional because a write
// only carries what its document selected, not because the schema allows one
// without the other.
type StoredSummary = StoreObject & {
  value?: unknown
  dtype?: string
}

// Keep a value the lightweight pass is holding back. Only a heavy dtype is ever
// blanked, so a null arriving over a value of that same dtype is a blank on its
// way to being filled, and the cached value stays. Everything else is DAMNIT's
// own answer and replaces what is there: a null scalar clears a stale number,
// and a retyped variable clears a value that no longer describes it, which is
// what puts the cell back in the deferred pass's queue.
function mergeSummary(
  existing: StoredSummary | undefined,
  incoming: StoredSummary,
  { mergeObjects }: FieldFunctionOptions
): StoredSummary {
  if (existing == null) {
    return incoming
  }

  // A write that selected only `value` carries no dtype; the cached one still
  // describes the cell, and merging rather than replacing is what keeps it.
  const dtype = incoming.dtype ?? existing.dtype
  const heldBackBlank =
    dtype != null &&
    dtype === existing.dtype &&
    existing.value != null &&
    isHeavySummaryBlank({ value: incoming.value, dtype })
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
    // The value guard lives here rather than on `Cell` because Apollo forbids a
    // merge function from reading sibling fields, so this is the only level that
    // can see `dtype` alongside the value. `error` is cell-level, so it cannot
    // be read here; the API drops the summary type of a failed cell so that a
    // failure never looks like a blank held back.
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
