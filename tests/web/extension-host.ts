import * as vscode from 'vscode'

const DIAGNOSTIC_TIMEOUT_MS = 10_000
const DIAGNOSTIC_POLL_INTERVAL_MS = 50

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${String(expected)}, got ${String(actual)}`,
    )
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

async function waitForVirtualDocument(): Promise<vscode.Uri> {
  const deadline = Date.now() + DIAGNOSTIC_TIMEOUT_MS

  while (Date.now() < deadline) {
    const documentUri = (await vscode.workspace.findFiles('**')).find(uri =>
      uri.path.endsWith('/src/example.ts'),
    )

    if (documentUri) {
      return documentUri
    }

    await delay(DIAGNOSTIC_POLL_INTERVAL_MS)
  }

  throw new Error('Expected virtual workspace example.ts')
}

async function waitForTodoDiagnostic(documentUri: vscode.Uri): Promise<void> {
  const deadline = Date.now() + DIAGNOSTIC_TIMEOUT_MS

  while (Date.now() < deadline) {
    const diagnostic = vscode.languages
      .getDiagnostics(documentUri)
      .find(
        candidate =>
          candidate.source === 'Code Beacon' &&
          candidate.message.startsWith('TODO:'),
      )

    if (diagnostic) {
      return
    }

    await delay(DIAGNOSTIC_POLL_INTERVAL_MS)
  }

  throw new Error(
    `Expected a Code Beacon TODO diagnostic for ${documentUri.toString()}`,
  )
}

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension('ntnyq.vscode-code-beacon')
  assert(extension, 'Expected Code Beacon to be installed')
  await extension.activate()

  await vscode.workspace
    .getConfiguration('code-beacon')
    .update('diagnostics.mode', 'workspace', vscode.ConfigurationTarget.Global)
  const documentUri = await waitForVirtualDocument()
  assertEqual(
    documentUri.scheme,
    'vscode-test-web',
    'Expected virtual workspace URI scheme',
  )
  await vscode.commands.executeCommand('code-beacon.scanWorkspace')

  await waitForTodoDiagnostic(documentUri)
}
