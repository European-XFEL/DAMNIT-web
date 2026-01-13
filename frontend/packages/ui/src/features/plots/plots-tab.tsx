import { Box, Stack, Text } from '@mantine/core'

import { removePlot, setCurrentPlot } from './plots.slice'
import PlotContainer from './plot-container'

import Tabs from '../../components/tabs/tabs'
import { useAppDispatch, useAppSelector } from '../../redux/hooks'
import { sorted } from '../../utils/array'
import { formatRunsSubtitle, isEmpty } from '../../utils/helpers'

const PlotsTab = () => {
  const dispatch = useAppDispatch()

  const plots = useAppSelector((state) => state.plots)
  const runs = useAppSelector((state) => state.tableData.metadata.runs)

  const contents = Object.fromEntries(
    Object.entries(plots.data).map(([id, plot]) => {
      const title = plot.title
      const subtitle = formatRunsSubtitle(sorted(plot.runs || runs))

      return [
        id,
        {
          element: (
            <Box mx={20}>
              <PlotContainer plotId={id} />
            </Box>
          ),
          title: (
            <Stack gap={0} w={160}>
              <Text
                size="sm"
                style={{
                  wordWrap: 'break-word',
                  whiteSpace: 'normal',
                }}
              >
                {title}
              </Text>
              <Text size="xs" c="dark.5">
                {subtitle}
              </Text>
            </Stack>
          ),
          isClosable: true,
          onClose: () => dispatch(removePlot(id)),
        },
      ]
    })
  )

  return isEmpty(contents) ? null : (
    <Tabs
      style={{ width: '100%', height: '100%' }}
      orientation="vertical"
      contents={contents}
      active={plots.currentPlot}
      setActive={(id) => dispatch(setCurrentPlot(id))}
      keepMounted={false}
    />
  )
}

export default PlotsTab
