import { Stack } from '@mantine/core'
import { useState } from 'react'
import { useAppSelector } from '../../redux/hooks'
import { BreadcrumbsBar } from './breadcrumbs-bar'
import { type SettingsView, nodeByView } from './settings-config'
import { isEmpty } from '../../utils/helpers'

function Settings() {
  const [currentView, setCurrentView] = useState<SettingsView>('main')
  const tags = useAppSelector(
    (state) => state.tableData.metadata.tags
  )
  const hasTags = isEmpty(tags) === false

  return (
    <Stack h="100%">
      <BreadcrumbsBar currentView={currentView} onNavigate={setCurrentView} />
      {nodeByView[currentView].component({
        onNavigate: setCurrentView,
        hasTags,
      })}
    </Stack>
  )
}

export default Settings
