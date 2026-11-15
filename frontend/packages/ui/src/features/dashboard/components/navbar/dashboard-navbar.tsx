import { useDisclosure } from '@mantine/hooks'

import PlotDialog from '#src/features/plots/plot-dialog'
import { useNavRail } from '#src/features/dashboard/hooks/use-nav-rail'
import { useTrackPreviousView } from '#src/features/dashboard/hooks/use-track-previous-view'
import { type DashboardUser } from '#src/features/dashboard/types/dashboard.types'

import ExpandedNavbar from './expanded-navbar'
import RailNavbar from './rail-navbar'

type DashboardNavbarProps = {
  user?: DashboardUser
}

function DashboardNavbar({ user }: DashboardNavbarProps) {
  const navRail = useNavRail()
  const [dialogOpened, dialog] = useDisclosure()
  useTrackPreviousView()

  const Navbar = navRail ? RailNavbar : ExpandedNavbar
  return (
    <>
      <Navbar user={user} onNewPlot={dialog.open} />
      <PlotDialog opened={dialogOpened} close={dialog.close} />
    </>
  )
}

export default DashboardNavbar
