import { type NavigateFunction, type Location } from 'react-router'

class HistoryService {
  private _navigate: NavigateFunction | null = null
  private _location: Location | null = null

  setNavigate(navigate: NavigateFunction) {
    this._navigate = navigate
  }

  setLocation(location: Location) {
    this._location = location
  }

  getNavigate(): NavigateFunction {
    if (!this._navigate) {
      throw new Error('Navigation function is not set yet.')
    }
    return this._navigate
  }

  getLocation(): Location {
    if (!this._location) {
      throw new Error('Location is not set yet.')
    }
    return this._location
  }

  navigate(destination: string | number): void {
    const navigate = this.getNavigate()

    // We have to narrow the union type due to the overloads in
    // `NavigateFunction`
    if (typeof destination === 'number') {
      navigate(destination)
    } else {
      navigate(destination)
    }
  }
}

export const history = new HistoryService()
