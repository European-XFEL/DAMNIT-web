import { expect, afterEach, vi } from "vitest"
import { cleanup } from "@testing-library/react"
import rtlMatchers from "@testing-library/jest-dom/matchers"
import "vitest-canvas-mock"

import matchers from "./test-utils/matchers"

// extends Vitest's expect method with methods from react-testing-library
expect.extend(rtlMatchers)

// extend Vitest's expect method with our own matchers
expect.extend(matchers)

// runs a cleanup after each test case (e.g. clearing jsdom)
afterEach(() => {
  cleanup()
})

// replace jest with vi
Object.defineProperty(global, "jest", {
  writable: true,
  value: vi,
})

// mock `window.matchMedia` to be compatible with `mantine`
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // Deprecated
    removeListener: vi.fn(), // Deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
})

// mock `window.ResizeObserver` to be compatible with `glide-data-grid`
Object.defineProperty(global, "ResizeObserver", {
  writable: true,
  value: vi.fn().mockImplementation(() => ({
    observe: vi.fn(() => "Mocking works"),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  })),
})
