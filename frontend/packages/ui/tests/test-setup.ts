// Shared modules such as constants.ts read window.location at import time to
// build the API URLs. The pure logic under test never touches those values,
// but the import would throw in Node without a stub. These tiny window/document
// shims keep the unit project on the fast Node environment instead of pulling
// in a full DOM polyfill. The document stub is only there so glide-data-grid's
// load-time font-cache setup detects "no fonts" and bails out early.
Object.defineProperty(globalThis, 'window', {
  value: { location: { origin: 'http://localhost', host: 'localhost' } },
  configurable: true,
  writable: true,
})

Object.defineProperty(globalThis, 'document', {
  value: {},
  configurable: true,
  writable: true,
})
