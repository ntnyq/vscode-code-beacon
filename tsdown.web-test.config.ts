import { defineConfig } from 'tsdown'

export default defineConfig({
  clean: false,
  deps: { neverBundle: ['vscode'] },
  dts: false,
  entry: ['tests/web/extension-host.ts'],
  format: 'cjs',
  outDir: 'dist/web-test',
  outExtensions: () => ({ js: '.cjs' }),
  platform: 'neutral',
})
