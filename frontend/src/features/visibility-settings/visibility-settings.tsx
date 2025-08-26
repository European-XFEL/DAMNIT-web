import { SpoilerList } from '../../components/spoilerList'
import { useAppSelector } from '../../redux'
import { Accordion } from '@mantine/core'
import { useAppDispatch } from '../../redux'
import {
  toggleColumnVisibility,
  setColumnGroupVisibility,
} from './visibility-settings.slice'

function VisibilitySettings() {
  const { tags } = useAppSelector((state) => state.tableData.metadata)
  const dispatch = useAppDispatch()

  function toggleOne(variableName: string) {
    dispatch(toggleColumnVisibility(variableName))
  }

  function toggleAll(columnNames: string[], isVisible: boolean) {
    dispatch(setColumnGroupVisibility({ columnNames, isVisible }))
  }

  return (
    <div>
      <h1>Visibility Settings</h1>
      <Accordion
        defaultValue={Object.keys(tags).length ? undefined : 'all-variables'}
      >
        <SpoilerList key={'all'} toggleOne={toggleOne} toggleAll={toggleAll} />
        {Object.values(tags).map((tag) => (
          <SpoilerList
            key={tag.id}
            tagId={tag.id}
            tagName={tag.name}
            toggleOne={toggleOne}
            toggleAll={toggleAll}
          />
        ))}
      </Accordion>
    </div>
  )
}

export default VisibilitySettings
