import { UnknownAction } from 'redux'
import { ThunkAction } from '@reduxjs/toolkit'

import { RootState } from '../redux/reducer'

export type AppThunk<ReturnType = void> = ThunkAction<
  ReturnType,
  RootState,
  unknown,
  UnknownAction
>
