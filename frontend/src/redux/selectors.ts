import { createSelector } from '@reduxjs/toolkit'
import { RootState } from './reducer'

export const createTypedSelector = createSelector.withTypes<RootState>()
