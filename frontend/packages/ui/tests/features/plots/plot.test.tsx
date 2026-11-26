import { times } from 'lodash-es'
import { render } from 'vitest-browser-react'
import { expect, test, vi } from 'vitest'

import Plot from '#src/features/plots/plot'
import type { PlotMeta } from '#src/features/plots/plots.types'

const pulses = times(200, (index) => index)

// Plotly's SVG nodes carry no role or text, so no locator reaches them and
// the tests query them by class.
async function renderPulsePlot(y: number[], meta: PlotMeta) {
  const { container } = await render(
    <Plot
      traces={[
        {
          x: { name: 'pulseIndex', value: pulses },
          y: { name: 'Run 7', value: y },
        },
      ]}
      meta={meta}
    />
  )

  await vi.waitFor(() =>
    expect(container.querySelector('.scatterlayer .trace')).not.toBeNull()
  )
  return container
}

test.each([
  { meta: { type: 'scatter' }, drawn: 'a line', lines: 1, points: 0 },
  {
    meta: { type: 'scatter', mode: 'markers' },
    drawn: 'markers only',
    lines: 0,
    points: 200,
  },
] as const)(
  'a scatter plot of $meta draws $drawn',
  async ({ meta, lines, points }) => {
    const container = await renderPulsePlot(
      pulses.map((i) => Math.sin(i / 10)),
      meta
    )

    expect(container.querySelectorAll('.scatterlayer .js-line')).toHaveLength(
      lines
    )
    expect(container.querySelectorAll('.scatterlayer .point')).toHaveLength(
      points
    )
  }
)
