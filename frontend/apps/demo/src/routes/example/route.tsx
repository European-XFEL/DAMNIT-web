import { useEffect } from 'react'
import { useLoaderData } from 'react-router'

import {
  NotFoundPage,
  resetExtractedData,
  resetMetadata,
  resetPlots,
  resetTableData,
  resetTableView,
  setMetadata,
  useAppDispatch,
  useProposal,
} from '@damnit-frontend/ui'

import { Dashboard } from '../../features/dashboard'

function ExampleRoute() {
  const proposal = useProposal({ subscribe: false })
  const dispatch = useAppDispatch()
  const { info } = useLoaderData()

  useEffect(() => {
    if (info?.id) {
      dispatch(setMetadata({ proposal: { value: info.id } }))
    } else {
      dispatch(setMetadata({ proposal: { notFound: true } }))
    }

    return () => {
      dispatch(resetTableData())
      dispatch(resetTableView())
      dispatch(resetExtractedData())
      dispatch(resetPlots())
      dispatch(resetMetadata())
    }
  }, [info?.id, dispatch])

  return proposal.notFound ? (
    <NotFoundPage />
  ) : (
    <Dashboard
      headerProps={{
        title: info.title,
        subtitle: info.subtitle,
        instrument: info.instrument,
      }}
    />
  )
}

export default ExampleRoute
