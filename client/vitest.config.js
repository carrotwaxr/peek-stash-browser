import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: [],
    include: ['**/*.{test,spec}.{js,jsx,ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.config.js',
        '**/*.spec.{js,jsx,ts,tsx}',
        '**/*.test.{js,jsx,ts,tsx}',
        'src/main.jsx',
      ],
    },
  },
});
