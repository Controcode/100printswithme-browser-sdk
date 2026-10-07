import { HundredPrints } from './public/hundred-prints';

export { HundredPrints } from './public/hundred-prints';
export { HundredPrintsError } from './public/errors';
export type * from './public/types';
export { BrowserSDK } from './browser-sdk';
export * from './types';

// Keep the historical UMD namespace while also exposing the v2 constructor
// directly for <script> users: `new window.HundredPrints(...)`.
if (typeof window !== 'undefined') {
  Object.defineProperty(globalThis, 'HundredPrints', {
    value: HundredPrints,
    configurable: true,
    writable: true,
  });
}
