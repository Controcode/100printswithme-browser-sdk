import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'BrowserSDK',
      formats: ['es', 'umd'],
      fileName: (format) => `100prints-sdk.${format}.js`,
    },

    rollupOptions: {
      // Bundle everything so the SDK stays fully self-contained.
      external: [],

      output: {
        inlineDynamicImports: true,
      },
    },

    target: 'es2020',

    assetsInlineLimit: 600000,

    minify: 'esbuild',

    // Source maps are useful for debugging,
    // but they add a lot of size to the published npm package.
    sourcemap: false,
  },

  plugins: [
    dts({
      bundleTypes: true,

      include: ['src'],

      exclude: [
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.spec.ts',
        '**/*.spec.tsx',
        '**/__tests__/**',
        '**/type-tests.ts',
      ],
    }),
  ],
});