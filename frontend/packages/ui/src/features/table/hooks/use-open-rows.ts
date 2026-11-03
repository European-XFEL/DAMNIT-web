import { useState } from 'react'

// Which rows have their details open. The list keeps it rather than the row,
// since a drag unmounts the row it lifts.
export function useOpenRows() {
  const [openNames, setOpenNames] = useState<ReadonlySet<string>>(new Set())

  const toggle = (name: string) =>
    setOpenNames((current) => {
      const next = new Set(current)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })

  return { openNames, toggle }
}
