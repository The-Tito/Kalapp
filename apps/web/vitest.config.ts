import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      'virtual:pwa-register/react': decodeURIComponent(
        new URL('./src/test/pwa-register-stub.ts', import.meta.url).pathname,
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
