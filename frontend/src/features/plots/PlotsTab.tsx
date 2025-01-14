import React from "react"
import { useDispatch, useSelector } from "react-redux"
import { Box, Stack, Text } from "@mantine/core"

import { removePlot, setCurrentPlot } from "./plotsSlice"
import PlotContainer from "./PlotContainer"
import Tabs from "../../components/tabs/Tabs"
import { sorted } from "../../utils/array"
import { formatRunsSubtitle } from "../../utils/helpers"

const PlotsTab = () => {
  const dispatch = useDispatch()

  const plots = useSelector((state) => state.plots)
  const runs = useSelector((state) => state.tableData.metadata.runs)

  // Get plot contents
  const plotContents = Object.entries(plots.data).map(([id, plot]) => {
    return [
      id,
      {
        title: plot.title,
        subtitle: formatRunsSubtitle(sorted(plot.runs || runs)),
      },
    ]
  })

  const tabContents = plotContents.map(([id, plot]) => [
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
              wordWrap: "break-word",
              whiteSpace: "normal",
            }}
          >
            {plot.title}
          </Text>
          <Text size="xs" c="dark.5">
            {plot.subtitle}
          </Text>
        </Stack>
      ),
      isClosable: true,
      onClose: () => dispatch(removePlot(id)),
    },
  ])

  return !tabContents.length ? null : (
    <Tabs
      orientation="vertical"
      contents={Object.fromEntries(tabContents)}
      active={plots.currentPlot}
      setActive={(id) => dispatch(setCurrentPlot(id))}
      keepMounted={false}
    />
  )
}

export default PlotsTab
