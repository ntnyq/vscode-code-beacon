import { useDisposable } from 'reactive-vscode'
import { Uri, languages, workspace } from 'vscode'
import { config } from '../config'
import { diagnosticsByUriForAnnotations } from '../core/diagnostics/beacon-diagnostics'
import { annotationStore } from '../core/store/annotation-store'

/**
 * Registers and keeps the Code Beacon diagnostic collection in sync.
 */
export function useBeaconDiagnostics() {
  const collection = languages.createDiagnosticCollection('code-beacon')

  /**
   * Republishes diagnostics from the current annotation store contents.
   */
  const publish = () => {
    collection.clear()

    const openUris = new Set(
      workspace.textDocuments.map(document => document.uri.toString()),
    )
    const diagnosticsByUri = diagnosticsByUriForAnnotations(
      annotationStore.getAll(),
      config.diagnostics.mode,
      openUris,
    )

    for (const [uri, diagnostics] of diagnosticsByUri) {
      collection.set(Uri.parse(uri), diagnostics)
    }
  }

  useDisposable(collection)
  useDisposable({
    dispose: annotationStore.subscribe(publish),
  })
  useDisposable(
    workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('code-beacon.diagnostics.mode')) {
        publish()
      }
    }),
  )
  useDisposable(workspace.onDidOpenTextDocument(publish))
  useDisposable(workspace.onDidCloseTextDocument(publish))

  publish()

  return {
    collection,
    publish,
  }
}
