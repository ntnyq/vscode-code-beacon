import { execFile } from 'node:child_process'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { runTests } from '@vscode/test-electron'

const execFileAsync = promisify(execFile)
const root = resolve(import.meta.dirname, '../..')
const packageJsonPath = resolve(root, 'package.json')
const distPath = resolve(root, 'dist/index.js')
const readmePath = resolve(root, 'README.md')
const changelogPath = resolve(root, 'CHANGELOG.md')
const playgroundPath = resolve(root, 'playground')
const extensionTestsPath = resolve(root, 'tests/e2e/extension-host.cjs')
const packageOutputPath = resolve(tmpdir(), 'vscode-code-beacon-e2e.vsix')

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

async function runCommand(command: string, args: readonly string[]) {
  const { stderr, stdout } = await execFileAsync(command, [...args], {
    cwd: root,
  })

  process.stdout.write(stdout)
  process.stderr.write(stderr)
}

async function main() {
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

  await runCommand('pnpm', [
    'exec',
    'vsce',
    'package',
    '--no-dependencies',
    '--out',
    packageOutputPath,
  ])
  assert(await pathExists(packageOutputPath), 'vsce package must create a VSIX')

  const userDataDir = await mkdtemp(
    resolve(
      process.platform === 'win32' ? tmpdir() : '/tmp',
      'code-beacon-e2e-',
    ),
  )

  try {
    await runTests({
      extensionDevelopmentPath: root,
      extensionTestsEnv: {
        CODE_BEACON_E2E_WORKSPACE: playgroundPath,
      },
      extensionTestsPath,
      launchArgs: [playgroundPath, `--user-data-dir=${userDataDir}`],
    })
  } finally {
    await rm(userDataDir, { force: true, recursive: true })
  }
}

setImmediate(main)
