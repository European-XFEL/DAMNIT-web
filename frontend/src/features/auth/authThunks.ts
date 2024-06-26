import Cookies from "js-cookie"
import { jwtDecode } from "jwt-decode"

import { reset, setUser } from "./authSlice"

export const decodeToken = (token) => {
  try {
    return jwtDecode(token)
  } catch (error) {
    console.error("Failed to decode JWT:", error)
    return null
  }
}

export const login = () => (dispatch) => {
  const token = Cookies.get("DAMNIT_AUTH_USER")

  if (token) {
    const decoded = decodeToken(token)
    if (decoded) {
      const user = {
        name: decoded.name,
        given_name: decoded.given_name,
        preferred_username: decoded.username,
        nickname: decoded.nickname,
        email: decoded.email,

        // TODO: replace with actual content
        groups: ["exfel_da"],
        proposals: [5709, 2956],
      }

      dispatch(setUser(user))
    }
  }
}

export const logout = () => (dispatch) => {
  Cookies.remove("DAMNIT_AUTH_USER")
  dispatch(reset())
}
