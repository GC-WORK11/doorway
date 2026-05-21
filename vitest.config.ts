import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['{apps,packages}/**/*.{test,spec}.{ts,tsx,js,jsx,mjs,cjs}'],
    exclude: [...configDefaults.exclude, 'our-competetors-and-resources/**'],
  },
});
