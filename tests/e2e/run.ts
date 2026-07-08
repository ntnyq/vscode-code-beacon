import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const packageJsonPath = resolve(root, 'package.json')
const distPath = resolve(root, 'dist/index.js')
const readmePath = resolve(root, 'README.md')
const changelogPath = resolve(root, 'CHANGELOG.md')

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message)
  }
}

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
  readonly contributes?: {
    readonly commands?: readonly { readonly command: string }[]
    readonly views?: Record<string, readonly { readonly id: string }[]>
  }
  readonly displayName?: string
}
const commands = new Set(
  packageJson.contributes?.commands?.map(command => command.command),
)
const views = packageJson.contributes?.views?.codeBeacon ?? []

assert(
  packageJson.displayName === 'Code Beacon',
  'displayName must be Code Beacon',
)
assert(existsSync(distPath), 'dist/index.js must exist after build')
assert(existsSync(readmePath), 'README.md must exist')
assert(existsSync(changelogPath), 'CHANGELOG.md must exist')
assert(
  commands.has('code-beacon.scanWorkspace'),
  'scanWorkspace command missing',
)
assert(
  commands.has('code-beacon.exportMarkdown'),
  'exportMarkdown command missing',
)
assert(
  views.some(view => view.id === 'codeBeacon.annotations'),
  'Code Beacon annotations view missing',
)

console.log('Code Beacon package smoke passed')
