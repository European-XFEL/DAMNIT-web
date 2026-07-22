import type {
  FieldFunctionOptions,
  Reference,
  StoreObject,
  TypePolicies,
} from '@apollo/client'

import { isHeavyBlank } from '#src/constants'

// A cell as it sits in the cache: an embedded object (Cell is not normalized)
// or, defensively, a reference.
type StoreCell = Reference | StoreObject

type ReadField = FieldFunctionOptions['readField']

// The held-back-blank rule over the cache's own cell representation. Reads
// `isHeavyBlank`, the same rule the table transforms apply to a plain cell, so a
// value @lightweight held back is never mistaken for one DAMNIT genuinely
// cleared, and the merge policy and the deferred-fetch selector stay in step.
function isDeferredCell(cell: StoreCell, readField: ReadField): boolean {
  return isHeavyBlank({
    value: readField('value', cell),
    error: readField('error', cell),
    dtype: readField<string>('dtype', cell)!,
  })
}

// Merge the lightweight, deferred, and pushed cell sets into one bag per run,
// keyed by name. A held-back value never overwrites a value already in place, so
// a cache-and-network refetch of the lightweight pass cannot blank a heavy value
// the deferred pass filled in. It still lands on a cell that has none yet,
// which is what draws the loading skeleton until the value arrives.
//
// Unlike the phase-1 slice, this cannot tell a live push from a bulk load, so it
// drops the "a live push may clear a value" branch. DAMNIT never un-computes a
// value back to null, so no real push relies on it.
function mergeCellsByName(
  existing: readonly StoreCell[] = [],
  incoming: readonly StoreCell[] = [],
  { readField }: FieldFunctionOptions
): StoreCell[] {
  const byName = new Map<string, StoreCell>()

  for (const cell of existing) {
    byName.set(readField<string>('name', cell)!, cell)
  }

  for (const cell of incoming) {
    const name = readField<string>('name', cell)!
    const previous = byName.get(name)
    const heldBack =
      previous != null &&
      isDeferredCell(cell, readField) &&
      readField('value', previous) != null
    if (heldBack) {
      continue
    }
    byName.set(name, cell)
  }

  return [...byName.values()]
}

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

export const typePolicies: TypePolicies = {
  DamnitRun: {
    keyFields: ['database', 'proposal', 'run'],
    fields: {
      cells: {
        keyArgs: false,
        merge: mergeCellsByName,
      },
    },
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
