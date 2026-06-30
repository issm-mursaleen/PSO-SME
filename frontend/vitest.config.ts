import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

// Vitest runs Alara's planner parity/behavioural specs in a Node environment.
// The `@` alias mirrors tsconfig so any non-type imports resolve the same way.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
});
