import { access, readFile } from 'node:fs/promises'
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

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)

    return true
  } catch {
    return false
  }
}

const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as {
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
assert(await pathExists(distPath), 'dist/index.js must exist after build')
assert(await pathExists(readmePath), 'README.md must exist')
assert(await pathExists(changelogPath), 'CHANGELOG.md must exist')
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
