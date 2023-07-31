import React from "react"
import Table from "@/features/table/Table"

import { renderWithProviders, screen } from "../../test-utils/extensions"
import { gridProps, validTable } from "../../test-utils/builders/table"

beforeEach(() => {
  Element.prototype.scrollTo = vi.fn()
  Element.prototype.scrollBy = vi.fn()
  Element.prototype.getBoundingClientRect = () => ({
    bottom: 1000,
    height: 1000,
    left: 0,
    right: 1000,
    top: 0,
    width: 1000,
    x: 0,
    y: 0,
    toJSON: () => "",
  })
  Image.prototype.decode = vi.fn()
})

afterEach(() => {
  // vi.clearAllTimers()
  vi.clearAllMocks()
})

describe("Table", () => {
  it("does not render canvas with invalid input", () => {
    renderWithProviders(<Table grid={gridProps} />)
    expect(screen.queryByTestId("data-grid-canvas")).not.toBeInTheDocument()
  })

  it("renders canvas with valid input", async () => {
    renderWithProviders(<Table grid={gridProps} />, {
      preloadedState: {
        table: validTable,
      },
    })

    expect(screen.getByTestId("data-grid-canvas")).toBeInTheDocument()
  })
})
