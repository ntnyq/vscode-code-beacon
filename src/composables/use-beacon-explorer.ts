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
import {
  BeaconTreeDataProvider,
  type BeaconLeafTreeElement,
} from '../core/explorer/tree-data-provider'
import { annotationStore } from '../core/store/annotation-store'
import { commands } from '../meta'
import type { BeaconAnnotation } from '../types/annotation'
import { formatBeaconLink, toVscodeRange } from '../utils/ranges'

/**
 * Stable VS Code view id for the Code Beacon annotations view.
 */
const BEACON_VIEW_ID = 'codeBeacon.annotations'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isBeaconAnnotation(value: unknown): value is BeaconAnnotation {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.uri === 'string' &&
    typeof value.line === 'number' &&
    typeof value.column === 'number' &&
    isRecord(value.range)
  )
}

function isBeaconLeafTreeElement(
  value: unknown,
): value is BeaconLeafTreeElement {
  return (
    isRecord(value) &&
    value.type === 'beacon' &&
    isBeaconAnnotation(value.annotation)
  )
}

function commandAnnotation(value: unknown): BeaconAnnotation | undefined {
  if (isBeaconAnnotation(value)) {
    return value
  }

  if (isBeaconLeafTreeElement(value)) {
    return value.annotation
  }

  if (value === undefined || value === null) {
    return annotationStore.getAll()[0]
  }

  return undefined
}

/**
 * Opens the document for an annotation and selects its matched range.
 */
async function revealAnnotation(value?: unknown) {
  const annotation = commandAnnotation(value)

  if (!annotation) {
    return
  }

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
    vscodeCommands.registerCommand(commands.copyLink, (value?: unknown) => {
      const annotation = commandAnnotation(value)

      return annotation
        ? env.clipboard.writeText(formatBeaconLink(annotation))
        : undefined
    }),
  )

  return {
    provider,
    view,
  }
}
