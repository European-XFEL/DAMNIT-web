import { authApi } from './auth.api'

import { HTTP_URL } from '../constants'
import { resetExtractedData } from '../data/extracted'
import { resetTable as resetTableData } from '../data/table'
import { resetTable as resetTableView } from '../features/table'
import { resetPlots } from '../features/plots'
import { type AppThunk } from '../redux/thunks'
import { history } from '../routes'

export const login = (): AppThunk => (_) => {
  window.location.href = `${HTTP_URL}oauth/login?redirect_uri=${HTTP_URL}home`
}

export const logout = (): AppThunk => (dispatch) => {
  fetch(`${HTTP_URL}oauth/logout?redirect_uri=${HTTP_URL}logged-out`, {
    method: 'GET',
    credentials: 'include', // Include cookies in the request
  })
    .then((response) => {
      if (response.ok) {
        // Reset the application
        dispatch(resetTableData())
        dispatch(resetTableView())
        dispatch(resetExtractedData())
        dispatch(resetPlots())
      }

      // Reset the API state
      dispatch(authApi.util.resetApiState())

      // Handle the redirect
      if (response.redirected && response.url) {
        history.navigate('/logged-out')
      }
    })
    .catch((error) => {
      console.error('Error logging out:', error)
    })
}
