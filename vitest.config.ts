import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Resolves the `@/*` path alias (declared in tsconfig.json) for tests, so unit
// tests can import modules that use `@/...` imports. Test-only; the Next.js
// build does not read this file.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
