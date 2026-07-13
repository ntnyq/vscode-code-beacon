import { useDisposable } from 'reactive-vscode'
import {
  ConfigurationTarget,
  commands as vscodeCommands,
  env,
  window,
  workspace,
} from 'vscode'
import type { Memento } from 'vscode'
import { config } from '../config'
import {
  formatAnnotations,
  formatAnnotationsAsMarkdown,
  type BeaconExportFormat,
} from '../core/export/format'
import { createMementoAnnotationStateStorage } from '../core/store/annotation-state'
import { annotationStore } from '../core/store/annotation-store'
import { commands, extensionId } from '../meta'
import type { BeaconAnnotation } from '../types/annotation'

/**
 * Updates the global extension enabled flag.
 */
async function updateEnabled(value: boolean) {
  await config.update('enable', value, ConfigurationTarget.Global)
}

/**
 * Opens an untitled editor containing exported annotation content.
 */
async function openExportDocument(format: BeaconExportFormat, content: string) {
  const extensionByFormat = {
    csv: 'csv',
    json: 'json',
    markdown: 'md',
  }
  const document = await workspace.openTextDocument({
    content,
    language: extensionByFormat[format],
  })

  await window.showTextDocument(document)
}

/**
 * Registers user-facing Code Beacon commands.
 */
export function useBeaconCommands(workspaceState: Memento) {
  const storage = createMementoAnnotationStateStorage(workspaceState)
  let saveChain = Promise.resolve()

  annotationStore.restoreState(storage.load())
  useDisposable({
    dispose: annotationStore.subscribe(() => {
      const state = annotationStore.getState()
      saveChain = saveChain
        .then(() => storage.save(state))
        .catch(() => undefined)
    }),
  })

  /**
   * Exports current store contents in the requested format.
   */
  const exportAnnotations = async (format: BeaconExportFormat) => {
    await openExportDocument(
      format,
      formatAnnotations(annotationStore.getAll(), format),
    )
  }

  useDisposable(
    vscodeCommands.registerCommand(commands.enable, () => updateEnabled(true)),
  )
  useDisposable(
    vscodeCommands.registerCommand(commands.disable, () =>
      updateEnabled(false),
    ),
  )
  useDisposable(
    vscodeCommands.registerCommand(commands.toggle, () =>
      updateEnabled(!config.enable),
    ),
  )
  useDisposable(
    vscodeCommands.registerCommand(commands.openSettings, () =>
      vscodeCommands.executeCommand(
        'workbench.action.openSettings',
        `@ext:${extensionId}`,
      ),
    ),
  )
  useDisposable(
    vscodeCommands.registerCommand(commands.clearCache, () =>
      annotationStore.clear(),
    ),
  )
  useDisposable(
    vscodeCommands.registerCommand(
      commands.resolve,
      (annotation: BeaconAnnotation) =>
        annotationStore.markResolved(annotation.id, true),
    ),
  )
  useDisposable(
    vscodeCommands.registerCommand(
      commands.unresolve,
      (annotation: BeaconAnnotation) =>
        annotationStore.markResolved(annotation.id, false),
    ),
  )
  useDisposable(
    vscodeCommands.registerCommand(
      commands.ignore,
      (annotation: BeaconAnnotation) =>
        annotationStore.markIgnored(annotation.id, true),
    ),
  )
  useDisposable(
    vscodeCommands.registerCommand(
      commands.unignore,
      (annotation: BeaconAnnotation) =>
        annotationStore.markIgnored(annotation.id, false),
    ),
  )
  useDisposable(
    vscodeCommands.registerCommand(
      commands.copyMarkdown,
      (annotation?: BeaconAnnotation) =>
        env.clipboard.writeText(
          formatAnnotationsAsMarkdown(
            annotation ? [annotation] : annotationStore.getAll(),
          ),
        ),
    ),
  )
  useDisposable(
    vscodeCommands.registerCommand(commands.exportMarkdown, () =>
      exportAnnotations('markdown'),
    ),
  )
  useDisposable(
    vscodeCommands.registerCommand(commands.exportJson, () =>
      exportAnnotations('json'),
    ),
  )
  useDisposable(
    vscodeCommands.registerCommand(commands.exportCsv, () =>
      exportAnnotations('csv'),
    ),
  )

  return {
    exportAnnotations,
  }
}
