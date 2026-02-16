import { useColumnVisibility } from './use-column-visibility'

export function useTable() {
  const columnVisibility = useColumnVisibility()

  return { columnVisibility }
}
