import { resolve } from 'node:path'
import { runTests } from '@vscode/test-web'

async function main() {
  const root = resolve(import.meta.dirname, '../..')
  const extensionTestsPath = resolve(root, 'dist/web-test/extension-host.cjs')
  const playgroundPath = resolve(root, 'playground')

  await runTests({
    browserType: 'chromium',
    extensionDevelopmentPath: root,
    extensionTestsPath,
    folderPath: playgroundPath,
  })
}

setImmediate(main)
