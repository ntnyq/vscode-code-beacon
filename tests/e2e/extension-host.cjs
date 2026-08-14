// oxlint-disable typescript/no-require-imports,node/no-process-env -- VS Code extension test entrypoints are loaded as CommonJS.
const assert = require('node:assert/strict')
const { resolve } = require('node:path')
const { setTimeout: delay } = require('node:timers/promises')
const vscode = require('vscode')

const workspacePath =
  process.env.ANNOPULSE_E2E_WORKSPACE || resolve(__dirname, '../../playground')
const extensionId = 'ntnyq.annopulse'

async function waitFor(predicate, message, timeoutMs = 10_000) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const value = await predicate()

    if (value) {
      return value
    }

    await delay(100)
  }

  throw new Error(message)
}

async function openWorkspaceDocument(relativePath) {
  const document = await vscode.workspace.openTextDocument(
    vscode.Uri.file(resolve(workspacePath, relativePath)),
  )
  await vscode.window.showTextDocument(document)

  return document
}

async function configure(key, value) {
  await vscode.workspace
    .getConfiguration('annopulse')
    .update(key, value, vscode.ConfigurationTarget.Global)
}

function hoverContentText(hover) {
  return hover.contents
    .map(content => (typeof content === 'string' ? content : content.value))
    .join('\n')
}

module.exports.run = async function run() {
  const extension = vscode.extensions.getExtension(extensionId)
  assert.ok(extension, `Expected extension ${extensionId} to be installed`)
  await extension.activate()

  await configure('diagnostics.mode', 'workspace')
  await configure('codelens.enabled', true)
  await configure('scanMode', 'manual')

  const document = await openWorkspaceDocument('src/example.ts')
  await vscode.commands.executeCommand('annopulse.scanActiveFile')

  const diagnostics = await waitFor(
    () =>
      vscode.languages
        .getDiagnostics(document.uri)
        .filter(diagnostic => diagnostic.source === 'AnnoPulse'),
    'Expected AnnoPulse diagnostics for the active file',
  )
  assert.ok(
    diagnostics.some(diagnostic => diagnostic.message.includes('TODO')),
    'Expected active-file diagnostics to include TODO',
  )

  await configure('scanMode', 'openEditors')
  const notebook = await vscode.workspace.openNotebookDocument(
    vscode.Uri.file(resolve(workspacePath, 'notebooks/annopulse.ipynb')),
  )
  const cell = notebook.cellAt(0)
  const notebookDiagnostics = await waitFor(
    () =>
      vscode.languages
        .getDiagnostics(cell.document.uri)
        .filter(diagnostic => diagnostic.source === 'AnnoPulse'),
    'Expected AnnoPulse diagnostics for the notebook cell',
  )
  assert.ok(
    notebookDiagnostics.some(diagnostic => diagnostic.message.includes('TODO')),
    'Expected notebook-cell diagnostics to include TODO',
  )

  const hovers = await vscode.commands.executeCommand(
    'vscode.executeHoverProvider',
    document.uri,
    new vscode.Position(3, 5),
  )
  assert.ok(hovers.length > 0, 'Expected AnnoPulse hover content')
  assert.match(hovers.map(hoverContentText).join('\n'), /Category: `todo`/u)

  const codeLenses = await vscode.commands.executeCommand(
    'vscode.executeCodeLensProvider',
    document.uri,
  )
  assert.ok(
    codeLenses.some(codeLens => codeLens.command?.title === 'Resolve'),
    'Expected Resolve CodeLens',
  )
  const resolveLens = codeLenses.find(
    codeLens => codeLens.command?.title === 'Resolve',
  )
  await vscode.commands.executeCommand(
    resolveLens.command.command,
    ...resolveLens.command.arguments,
  )
  await waitFor(
    () =>
      vscode.languages
        .getDiagnostics(document.uri)
        .filter(diagnostic => diagnostic.source === 'AnnoPulse').length <
      diagnostics.length,
    'Expected resolving an annotation to reduce diagnostics',
  )

  await vscode.commands.executeCommand('annopulse.scanWorkspace')
  await vscode.commands.executeCommand('annopulse.exportJson')
  const exportDocument = vscode.window.activeTextEditor?.document
  assert.equal(exportDocument?.languageId, 'json')
  assert.match(exportDocument.getText(), /example\.py/u)
}
