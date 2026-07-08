import { useDisposable } from 'reactive-vscode'
import {
  ConfigurationTarget,
  commands as vscodeCommands,
  env,
  window,
  workspace,
} from 'vscode'
import { config } from '../config'
import {
  formatAnnotations,
  formatAnnotationsAsMarkdown,
  type BeaconExportFormat,
} from '../core/export/format'
import { annotationStore } from '../core/store/annotation-store'
import { commands, extensionId } from '../meta'
import type { BeaconAnnotation } from '../types/annotation'

async function updateEnabled(value: boolean) {
  await config.update('enable', value, ConfigurationTarget.Global)
}

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

export function useBeaconCommands() {
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
