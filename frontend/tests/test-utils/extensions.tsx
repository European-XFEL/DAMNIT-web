import React from "react"
import { Provider } from "react-redux"
import { MantineProvider } from "@mantine/core"
import { render, screen, act } from "@testing-library/react"
import { setupStore } from "@/redux"

export { screen, act }

export function renderWithProviders(
  ui,
  {
    preloadedState = {},
    // Automatically create a store instance if no store was passed in
    store = setupStore(preloadedState),
    ...renderOptions
  } = {},
) {
  function Wrapper({ children }) {
    return (
      <Provider store={store}>
        <MantineProvider>{children}</MantineProvider>
      </Provider>
    )
  }
  return { store, ...render(ui, { wrapper: Wrapper, ...renderOptions }) }
}
