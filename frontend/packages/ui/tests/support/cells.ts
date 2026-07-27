// The server's cell id, "{database}:{proposal}:{run}:{name}" (built in
// `DamnitRun._iter_cells`). Apollo keys `Cell` on it, so a fixture that spells
// it differently mints a second entity for the same cell, which is exactly the
// drift these tests exist to catch. `database` leads and is not the proposal: a
// guest run is served through one database and reports another proposal.
export function cellId({
  database,
  proposal,
  run,
  name,
}: {
  database: string
  proposal: string
  run: number
  name: string
}): string {
  return `${database}:${proposal}:${run}:${name}`
}
