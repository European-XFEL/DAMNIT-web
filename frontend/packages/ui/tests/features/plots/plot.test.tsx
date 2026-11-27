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
  { type: 'line', drawn: 'a line', lines: 1, points: 0 },
  { type: 'scatter', drawn: 'markers only', lines: 0, points: 200 },
] as const)('a $type plot draws $drawn', async ({ type, lines, points }) => {
  const container = await renderPulsePlot(
    pulses.map((i) => Math.sin(i / 10)),
    { type }
  )

  expect(container.querySelectorAll('.scatterlayer .js-line')).toHaveLength(
    lines
  )
  expect(container.querySelectorAll('.scatterlayer .point')).toHaveLength(
    points
  )
})

test('a line of 20 or more points draws a marker at each lone value', async () => {
  const readings = new Map([
    [10, 0.5],
    [50, 0.7],
    [120, 0.2],
  ])
  const container = await renderPulsePlot(
    // The API sends NaN as null, which the trace's type leaves out.
    pulses.map((i) => readings.get(i) ?? null) as number[],
    { type: 'line' }
  )

  expect(container.querySelectorAll('.scatterlayer .point')).toHaveLength(3)
})
