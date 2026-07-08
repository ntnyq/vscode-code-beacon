import { useDisposable } from 'reactive-vscode'
import { Uri, languages, workspace } from 'vscode'
import { config } from '../config'
import { createBeaconDiagnostic } from '../core/diagnostics/beacon-diagnostics'
import { annotationStore } from '../core/store/annotation-store'

export function useBeaconDiagnostics() {
  const collection = languages.createDiagnosticCollection('code-beacon')

  const publish = () => {
    collection.clear()

    if (config.diagnostics.mode === 'off') {
      return
    }

    const diagnosticsByUri = new Map<
      string,
      ReturnType<typeof createBeaconDiagnostic>[]
    >()

    for (const annotation of annotationStore.getAll()) {
      diagnosticsByUri.set(annotation.uri, [
        ...(diagnosticsByUri.get(annotation.uri) ?? []),
        createBeaconDiagnostic(annotation),
      ])
    }

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

  publish()

  return {
    collection,
    publish,
  }
}
