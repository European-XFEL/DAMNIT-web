import { Stack } from '@mantine/core'
import { useState } from 'react'
import { useAppSelector } from '../../redux'
import { BreadcrumbsBar } from './breadcrumbs-bar'
import {
  buildIndex,
  settingsTree,
  SettingsView,
  viewIndex,
} from './settings-config'

function Settings() {
  const [currentView, setCurrentView] = useState<SettingsView>('main')
  const hasTags = useAppSelector(
    (state) => !!Object.keys(state.tableData.metadata.tags).length
  )
  buildIndex(settingsTree)

  return (
    <Stack h="100%">
      <BreadcrumbsBar currentView={currentView} onNavigate={setCurrentView} />
      {viewIndex[currentView].component({ setCurrentView, hasTags })}
    </Stack>
  )
}

export default Settings
