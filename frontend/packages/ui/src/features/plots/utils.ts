export function generateUID() {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  )
}

// Reads the dialog's run selection: a comma-separated list of runs and ranges,
// as its own placeholder spells out ("1,2,3,6-20,22").
export function parseRunSelection(input: string) {
  return String(input)
    .split(',')
    .reduce<string[]>((runs, entry) => {
      if (!entry.includes('-')) {
        runs.push(entry)
        return runs
      }

      // Numerically: sorting these as strings puts "20" before "6", leaving a
      // range that counts down and so selects nothing at all.
      const [bottom, top] = entry
        .split('-')
        .map(Number)
        .sort((first, second) => first - second)
      for (let run = bottom; run <= top; run++) {
        runs.push(String(run))
      }
      return runs
    }, [])
}
