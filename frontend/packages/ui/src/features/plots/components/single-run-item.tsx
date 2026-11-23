import StatusItem from '#src/components/statuses/status-item'
import { describeHiddenRuns } from '#src/features/plots/preview-plot.transforms'
import type { SingleRunKind } from '#src/features/plots/plots.types'

type SingleRunItemProps = {
  kind: SingleRunKind
  run: number
  // The other runs with data that the plot leaves out.
  hiddenCount: number
}

function SingleRunItem({ kind, run, hiddenCount }: SingleRunItemProps) {
  return (
    <StatusItem
      label="Showing"
      value={`Run ${run} only`}
      tooltip={describeHiddenRuns({ kind, hiddenCount })}
      level="warning"
    />
  )
}

export default SingleRunItem
