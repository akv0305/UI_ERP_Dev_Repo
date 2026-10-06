// Jest resolves '@jest/globals' itself at runtime (needed because the API tests run as ESM,
// where the global `jest` object is not injected). This maps its types to @types/jest.
declare module '@jest/globals' {
  export const jest: typeof globalThis.jest;
}
