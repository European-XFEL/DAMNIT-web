import { type ThunkAction, type UnknownAction } from '@reduxjs/toolkit'

import { type RootState } from '../redux/reducer'

export type AppThunk<ReturnType = void> = ThunkAction<
  ReturnType,
  RootState,
  unknown,
  UnknownAction
>
