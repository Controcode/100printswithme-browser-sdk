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
      // Bundling everything so the SDK is fully self-contained.
      external: [],
      output: {
        inlineDynamicImports: true,
      }
    },
    target: 'es2020',
    minify: 'esbuild',
    sourcemap: true,
  },
  plugins: [
    dts({ rollupTypes: true })
  ],
});
