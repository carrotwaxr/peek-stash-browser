import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: [],
    include: ['**/*.{test,spec}.{js,jsx,ts,tsx}'],
  },
});
