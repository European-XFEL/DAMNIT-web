import { useMemo } from 'react'
import { Modal, rem } from '@mantine/core'
import { IconX } from '@tabler/icons-react'

import { plotRequested } from '#src/app/store/actions'
import { useAppDispatch } from '#src/app/store/hooks'
import { useTableMeta, useTableVariables } from '#src/data/table/use-table-meta'
import { buildVariableBlocks } from '#src/data/table/variable-blocks'

import { PlotForm } from './plot-form'

type PlotDialogProps = {
  opened: boolean
  close: () => void
}

// The form unmounts with the closed modal, so every opening starts it afresh.
function PlotDialog({ opened, close }: PlotDialogProps) {
  const dispatch = useAppDispatch()
  const variables = useTableVariables()
  const { groups } = useTableMeta()

  const blocks = useMemo(
    () =>
      buildVariableBlocks(variables, {
        groups,
        toItem: (_variable, item) => item,
      }),
    [variables, groups]
  )

  return (
    <Modal
      opened={opened}
      onClose={close}
      title="New plot"
      keepMounted={false}
      centered
      closeButtonProps={{
        'aria-label': 'Close',
        size: 'sm',
        icon: (
          <IconX style={{ width: rem(16), height: rem(16) }} stroke={1.5} />
        ),
      }}
    >
      <PlotForm
        blocks={blocks}
        onSubmit={(plot) => {
          dispatch(plotRequested(plot))
          close()
        }}
        onCancel={close}
      />
    </Modal>
  )
}

export default PlotDialog
