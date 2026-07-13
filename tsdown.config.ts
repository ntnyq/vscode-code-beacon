import process from 'node:process'
import { defineConfig } from 'tsdown'
import pkg from './package.json' with { type: 'json' }

const isDev = (): boolean => process.env.NODE_ENV === 'development'

export default defineConfig({
  clean: true,
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  deps: {
    alwaysBundle: Object.keys(pkg.dependencies),
    neverBundle: ['vscode'],
    onlyBundle: false,
  },
  dts: false,
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  minify: !isDev(),
  platform: 'neutral',
  shims: true,
  sourcemap: isDev(),
  watch: isDev(),
})
