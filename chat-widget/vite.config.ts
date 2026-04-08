import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'CrewFormChat',
      fileName: () => 'crewform-chat.js',
      formats: ['iife'],
    },
    outDir: 'dist',
    minify: 'esbuild',
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
