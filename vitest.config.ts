import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Only application regressions are Vitest inputs. Reproducibility copies and
// evidence under .cache must not be rediscovered as duplicate test suites.
// Node release/budget guards have their own explicit node --test commands.
export default mergeConfig(viteConfig, defineConfig({
  test: { include: ['src/**/*.test.{ts,tsx}'] },
}));
