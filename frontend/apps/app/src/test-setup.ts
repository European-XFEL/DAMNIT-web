import '@testing-library/jest-dom/vitest'

// Stub browser APIs that plotly.js / mapbox-gl require in jsdom
window.URL.createObjectURL = () => ''
window.URL.revokeObjectURL = () => undefined
HTMLCanvasElement.prototype.getContext = (() =>
  null) as unknown as typeof HTMLCanvasElement.prototype.getContext

// Mantine requires matchMedia (not in jsdom)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})
