import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'src/web',
  plugins: [react()],
  build: { outDir: '../../dist/web', emptyOutDir: true },
  server: {
    port: 5180,
    proxy: { '/api': `http://localhost:${process.env.PORT ?? 3340}` },
  },
  test: {
    root: '.',
    include: ['tests/**/*.test.ts'],
    globals: true,
  },
});
