import { readFile, writeFile } from 'node:fs/promises'

const metaPath = new URL('../src/meta.ts', import.meta.url)
const source = await readFile(metaPath, 'utf8')
const normalized = source.replace(/(?:\r?\n)+$/u, '\n')

if (normalized !== source) {
  await writeFile(metaPath, normalized)
}
