import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // dist-server holds compiled copies of these same tests; without this they
    // run twice and the reported count is misleading.
    exclude: ['dist-server/**', 'dist/**', 'node_modules/**'],
  },
})
