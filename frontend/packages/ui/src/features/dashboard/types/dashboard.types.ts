export type View =
  | { kind: 'table' }
  | { kind: 'context-file' }
  | { kind: 'plot'; id: string }

export type DashboardUser = {
  name: string
  onLogout: () => void
}
