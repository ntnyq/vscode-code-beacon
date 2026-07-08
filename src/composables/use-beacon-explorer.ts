import { useDisposable } from 'reactive-vscode'
import {
  Selection,
  Uri,
  commands as vscodeCommands,
  env,
  window,
  workspace,
} from 'vscode'
import { config } from '../config'
import { BeaconTreeDataProvider } from '../core/explorer/tree-data-provider'
import { annotationStore } from '../core/store/annotation-store'
import { commands } from '../meta'
import type { BeaconAnnotation } from '../types/annotation'
import { formatBeaconLink, toVscodeRange } from '../utils/ranges'

/**
 * Stable VS Code view id for the Code Beacon annotations view.
 */
const BEACON_VIEW_ID = 'codeBeacon.annotations'

/**
 * Opens the document for an annotation and selects its matched range.
 */
async function revealAnnotation(annotation: BeaconAnnotation) {
  const document = await workspace.openTextDocument(Uri.parse(annotation.uri))
  const editor = await window.showTextDocument(document)
  const range = toVscodeRange(annotation.range)

  editor.selection = new Selection(range.start, range.end)
  editor.revealRange(range)
}

/**
 * Registers the Code Beacon TreeView and related navigation commands.
 */
export function useBeaconExplorer() {
  const provider = new BeaconTreeDataProvider(
    () => annotationStore.getAll(),
    () => config.explorer.groupBy,
  )

  const view = window.createTreeView(BEACON_VIEW_ID, {
    showCollapseAll: true,
    treeDataProvider: provider,
  })

  useDisposable(view)
  useDisposable({
    dispose: annotationStore.subscribe(() => provider.refresh()),
  })
  useDisposable(
    vscodeCommands.registerCommand(commands.focusExplorer, () =>
      vscodeCommands.executeCommand(`${BEACON_VIEW_ID}.focus`),
    ),
  )
  useDisposable(
    vscodeCommands.registerCommand(commands.reveal, revealAnnotation),
  )
  useDisposable(
    vscodeCommands.registerCommand(
      commands.copyLink,
      (annotation: BeaconAnnotation) =>
        env.clipboard.writeText(formatBeaconLink(annotation)),
    ),
  )

  return {
    provider,
    view,
  }
}
