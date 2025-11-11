import { createSelector } from '@reduxjs/toolkit'
import { type RootState } from './reducer'

export const createTypedSelector = createSelector.withTypes<RootState>()
