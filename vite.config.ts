import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'local-health-data-policy',
      apply: 'build',
      transformIndexHtml() {
        return [
          {
            tag: 'meta',
            attrs: {
              'http-equiv': 'Content-Security-Policy',
              content:
                "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; worker-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'",
            },
          },
        ];
      },
    },
  ],
  // Applied only to built artifacts: deny all runtime network connections, including same-origin uploads.
  // Development keeps Vite's local HMR connection available.
  build: { sourcemap: false },
  base: '/Jog/',
  worker: { format: 'es' },
  test: { include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'] },
});
