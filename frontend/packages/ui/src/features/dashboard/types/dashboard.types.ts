// The view the address shows. A plot link that names no plot has no id.
export type View =
  { kind: 'table' } | { kind: 'context-file' } | { kind: 'plot'; id?: string }

export type DashboardUser = {
  name: string
  onLogout: () => void
}
