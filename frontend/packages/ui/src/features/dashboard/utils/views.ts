import { type View } from '#src/features/dashboard/types/dashboard.types'

export const TABLE_VIEW: View = { kind: 'table' }
export const CONTEXT_FILE_VIEW: View = { kind: 'context-file' }

export function isSameView(view: View, other: View) {
  if (view.kind === 'plot' && other.kind === 'plot') {
    return view.id === other.id
  }
  return view.kind === other.kind
}
