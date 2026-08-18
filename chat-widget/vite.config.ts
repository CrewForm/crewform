import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      name: 'CrewFormChat',
      fileName: () => 'crewform-chat.js',
      formats: ['iife'],
    },
    outDir: 'dist',
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
