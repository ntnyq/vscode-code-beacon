import { useDisposable } from 'reactive-vscode'
import {
  Selection,
  Uri,
  commands as vscodeCommands,
  env,
  window,
  workspace,
  type Disposable,
  type TextDocument,
} from 'vscode'
import { config } from '../config'
import { filterBeaconAnnotations } from '../core/explorer/filter'
import { BeaconExplorerGitMetadataIndex } from '../core/explorer/git-metadata-index'
import {
  BeaconTreeDataProvider,
  type BeaconLeafTreeElement,
} from '../core/explorer/tree-data-provider'
import { annotationStore } from '../core/store/annotation-store'
import { commands } from '../meta'
import type { BeaconAnnotation } from '../types/annotation'
import { formatBeaconLink, toVscodeRange } from '../utils/ranges'
import { useBeaconGit } from './use-beacon-git'

/**
 * Stable VS Code view id for the Code Beacon annotations view.
 */
const BEACON_VIEW_ID = 'codeBeacon.annotations'
const DEFAULT_STALE_DAYS = 90

function normalizeStaleDays(value: unknown): number {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 1
    ? value
    : DEFAULT_STALE_DAYS
}

function isChangedFilesScope(): boolean {
  return config.explorer.scope === 'changedFiles'
}

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
  const gitMetadataIndex = new BeaconExplorerGitMetadataIndex<TextDocument>()
  const { getChangedUris, getMetadataForAnnotations, subscribeToChangedUris } =
    useBeaconGit()
  let changedUris = new Set<string>()
  const provider = new BeaconTreeDataProvider(
    () =>
      filterBeaconAnnotations(annotationStore.getAll(), {
        activeUri: window.activeTextEditor?.document.uri.toString(),
        categories: config.explorer.categories,
        changedUris,
        includeIgnored: config.explorer.includeIgnored,
        includeResolved: config.explorer.includeResolved,
        metadataByAnnotationId: gitMetadataIndex.metadataByAnnotationId,
        now: new Date(),
        onlyOwnerless: config.explorer.onlyOwnerless,
        onlyStale: config.explorer.onlyStale,
        openUris: window.visibleTextEditors.map(editor =>
          editor.document.uri.toString(),
        ),
        owners: config.explorer.owners,
        query: config.explorer.query,
        scope: config.explorer.scope,
        severities: config.explorer.severities,
        staleDays: normalizeStaleDays(config.git.staleDays),
      }),
    () => config.explorer.groupBy,
  )

  let hydrationRequest = 0
  let changedUrisRequest = 0
  let changedUrisSubscription: Disposable | undefined
  let changedUrisSubscriptionRequest = 0
  let isChangedUrisSubscriptionPending = false

  function disposeChangedUrisSubscription() {
    changedUrisSubscriptionRequest += 1
    isChangedUrisSubscriptionPending = false
    changedUrisSubscription?.dispose()
    changedUrisSubscription = undefined
  }

  function clearChangedUris() {
    changedUrisRequest += 1
    changedUris = new Set()
    disposeChangedUrisSubscription()
  }

  function refreshChangedUris() {
    if (!isChangedFilesScope()) {
      clearChangedUris()
      return
    }

    if (!changedUrisSubscription && !isChangedUrisSubscriptionPending) {
      const subscriptionRequest = changedUrisSubscriptionRequest
      isChangedUrisSubscriptionPending = true
      // oxlint-disable-next-line no-void -- VS Code listeners cannot await Git setup.
      void subscribeToChangedUris(refreshExplorer)
        .then(subscription => {
          if (
            subscriptionRequest !== changedUrisSubscriptionRequest ||
            !isChangedFilesScope()
          ) {
            subscription.dispose()
            return
          }

          changedUrisSubscription = subscription
        })
        .catch(() => undefined)
        .finally(() => {
          if (subscriptionRequest === changedUrisSubscriptionRequest) {
            isChangedUrisSubscriptionPending = false
          }
        })
    }

    const request = changedUrisRequest + 1
    changedUrisRequest = request
    // oxlint-disable-next-line no-void -- VS Code listeners cannot await Git snapshots.
    void getChangedUris().then(
      uris => {
        if (request !== changedUrisRequest || !isChangedFilesScope()) {
          return
        }

        changedUris = new Set(uris)
        provider.refresh()
      },
      () => {
        if (request !== changedUrisRequest || !isChangedFilesScope()) {
          return
        }

        changedUris = new Set()
        provider.refresh()
      },
    )
  }

  async function hydrateGitMetadata() {
    const request = hydrationRequest + 1
    hydrationRequest = request
    gitMetadataIndex.clear()

    if (!config.explorer.onlyStale || !workspace.isTrusted) {
      return
    }

    const annotationsByUri = new Map<string, BeaconAnnotation[]>()
    for (const annotation of annotationStore.getAll()) {
      annotationsByUri.set(annotation.uri, [
        ...(annotationsByUri.get(annotation.uri) ?? []),
        annotation,
      ])
    }

    const targets: {
      document: TextDocument
      annotations: readonly BeaconAnnotation[]
    }[] = []
    for (const [uri, annotations] of annotationsByUri) {
      if (
        request !== hydrationRequest ||
        !config.explorer.onlyStale ||
        !workspace.isTrusted
      ) {
        return
      }

      try {
        const document = await workspace.openTextDocument(Uri.parse(uri))
        if (
          request !== hydrationRequest ||
          !config.explorer.onlyStale ||
          !workspace.isTrusted
        ) {
          return
        }

        targets.push({ annotations, document })
      } catch {
        continue
      }
    }

    if (
      request !== hydrationRequest ||
      !config.explorer.onlyStale ||
      !workspace.isTrusted
    ) {
      return
    }

    await gitMetadataIndex.hydrate(targets, getMetadataForAnnotations, () =>
      provider.refresh(),
    )
  }

  function refreshExplorer() {
    provider.refresh()
    refreshChangedUris()
    // oxlint-disable-next-line no-void -- VS Code listeners cannot await hydration.
    void hydrateGitMetadata()
  }

  const view = window.createTreeView(BEACON_VIEW_ID, {
    showCollapseAll: true,
    treeDataProvider: provider,
  })

  useDisposable(view)
  useDisposable({ dispose: disposeChangedUrisSubscription })
  useDisposable({
    dispose: annotationStore.subscribe(refreshExplorer),
  })
  useDisposable(window.onDidChangeActiveTextEditor(refreshExplorer))
  useDisposable(window.onDidChangeVisibleTextEditors(refreshExplorer))
  useDisposable(
    workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('code-beacon')) {
        refreshExplorer()
      }
    }),
  )
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

  // oxlint-disable-next-line no-void -- Explorer setup cannot await hydration.
  void hydrateGitMetadata()
  refreshChangedUris()

  return {
    provider,
    view,
  }
}
