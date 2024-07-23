import { authApi } from "../api"
import { resetTable } from "../table"
import { resetPlots } from "../plots"
import { resetExtractedData, resetTableData } from "../../redux"
import { history } from "../../routes"

export const login = () => (dispatch) => {
  window.location.href = "/oauth/login"
}

export const logout = () => (dispatch) => {
  fetch("/oauth/logout", {
    method: "GET",
    credentials: "include", // Include cookies in the request
  })
    .then((response) => {
      if (response.ok) {
        // Reset the application
        dispatch(resetTableData())
        dispatch(resetTable())
        dispatch(resetExtractedData())
        dispatch(resetPlots())
      }

      // Reset the API state
      dispatch(authApi.util.resetApiState())

      // Handle the redirect
      if (response.redirected && response.url) {
        history.navigate("/logged-out")
      }
    })
    .catch((error) => {
      console.error("Error logging out:", error)
    })
}
