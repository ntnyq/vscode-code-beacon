import { useDisposable } from 'reactive-vscode'
import {
  ConfigurationTarget,
  commands as vscodeCommands,
  env,
  LanguageModelChatMessage,
  LanguageModelTextPart,
  lm,
  ProgressLocation,
  Uri,
  window,
  workspace,
} from 'vscode'
import type { LanguageModelChat, Memento, OutputChannel } from 'vscode'
import { config } from '../config'
import {
  annotationExplanationPrompt,
  annotationSourceWindow,
} from '../core/ai/explain-annotation'
import type { BeaconLeafTreeElement } from '../core/explorer/tree-data-provider'
import {
  formatAnnotations,
  formatAnnotationsAsMarkdown,
  type BeaconExportFormat,
} from '../core/export/format'
import { formatBeaconIssue } from '../core/issues/format'
import { createMementoAnnotationStateStorage } from '../core/store/annotation-state'
import { annotationStore } from '../core/store/annotation-store'
import { commands, extensionId } from '../meta'
import type { BeaconAnnotation } from '../types/annotation'

const BEACON_EXPLAIN_COMMAND = 'code-beacon.explain'

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isBeaconCategory(value: unknown): boolean {
  return (
    value === 'todo' ||
    value === 'fixme' ||
    value === 'bug' ||
    value === 'hack' ||
    value === 'note' ||
    value === 'review' ||
    value === 'security' ||
    value === 'perf' ||
    value === 'question' ||
    value === 'custom'
  )
}

function isBeaconSeverity(value: unknown): boolean {
  return (
    value === 'hint' ||
    value === 'information' ||
    value === 'warning' ||
    value === 'error'
  )
}

function isSerializedPosition(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.line === 'number' &&
    Number.isInteger(value.line) &&
    value.line >= 0 &&
    typeof value.character === 'number' &&
    Number.isInteger(value.character) &&
    value.character >= 0
  )
}

function isSerializedRange(value: unknown): boolean {
  return (
    isRecord(value) &&
    isSerializedPosition(value.start) &&
    isSerializedPosition(value.end)
  )
}

function isBeaconStyle(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.marker === 'keyword' ||
      value.marker === 'message' ||
      value.marker === 'line') &&
    typeof value.color === 'string' &&
    typeof value.backgroundColor === 'string' &&
    typeof value.border === 'string' &&
    typeof value.borderRadius === 'string' &&
    typeof value.overviewRulerColor === 'string'
  )
}

function isBeaconDiagnostics(value: unknown): boolean {
  return (
    isRecord(value) &&
    (!('enabled' in value) || typeof value.enabled === 'boolean') &&
    (!('severity' in value) || isBeaconSeverity(value.severity))
  )
}

function isBeaconSource(value: unknown): boolean {
  return (
    value === 'visibleEditor' ||
    value === 'openEditor' ||
    value === 'workspace' ||
    value === 'notebook'
  )
}

function isBeaconAnnotation(value: unknown): value is BeaconAnnotation {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.ruleId === 'string' &&
    isBeaconCategory(value.category) &&
    isBeaconSeverity(value.severity) &&
    typeof value.uri === 'string' &&
    typeof value.languageId === 'string' &&
    isSerializedRange(value.range) &&
    isSerializedRange(value.keywordRange) &&
    typeof value.line === 'number' &&
    Number.isInteger(value.line) &&
    value.line >= 0 &&
    typeof value.column === 'number' &&
    Number.isInteger(value.column) &&
    value.column >= 0 &&
    typeof value.keyword === 'string' &&
    typeof value.message === 'string' &&
    isBeaconSource(value.source) &&
    (value.style === undefined || isBeaconStyle(value.style)) &&
    (value.messageRange === undefined ||
      isSerializedRange(value.messageRange)) &&
    (value.diagnostics === undefined ||
      isBeaconDiagnostics(value.diagnostics)) &&
    (value.owner === undefined || typeof value.owner === 'string') &&
    (value.dueDate === undefined || typeof value.dueDate === 'string') &&
    (value.expiresDate === undefined ||
      typeof value.expiresDate === 'string') &&
    (value.resolved === undefined || typeof value.resolved === 'boolean') &&
    (value.ignored === undefined || typeof value.ignored === 'boolean')
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

function issueAnnotation(value: unknown): BeaconAnnotation | undefined {
  if (isBeaconAnnotation(value)) {
    return value
  }

  if (isBeaconLeafTreeElement(value)) {
    return value.annotation
  }

  return undefined
}

function explanationOutputHeading(annotation: BeaconAnnotation): string {
  return [
    '# Code Beacon explanation',
    '',
    `URI: ${annotation.uri}`,
    `Location: line ${annotation.line + 1}, column ${annotation.column + 1}`,
    '',
  ].join('\n')
}

const createLanguageModelUserMessage = LanguageModelChatMessage.User

/**
 * Registers user-facing Code Beacon commands.
 */
export function useBeaconCommands(workspaceState: Memento) {
  const storage = createMementoAnnotationStateStorage(workspaceState)
  let saveChain = Promise.resolve()
  let explainOutputChannel: OutputChannel | undefined
  let explainRequestGeneration = 0

  useDisposable({
    dispose() {
      explainRequestGeneration++
      explainOutputChannel?.dispose()
      explainOutputChannel = undefined
    },
  })

  annotationStore.restoreState(storage.load())
  useDisposable({
    dispose: annotationStore.subscribe(() => {
      const state = annotationStore.getState()
      saveChain = saveChain.then(() => storage.save(state)).catch(() => {})
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

  const explainAnnotation = async (value?: unknown) => {
    const annotation = issueAnnotation(value)

    if (!annotation) {
      await window.showWarningMessage(
        'Select a beacon in the Explorer to explain it.',
      )
      return
    }

    if (!config.ai.enabled) {
      await window.showWarningMessage(
        'Enable code-beacon.ai.enabled to explain annotations.',
      )
      return
    }

    const requestGeneration = ++explainRequestGeneration
    explainOutputChannel?.clear()
    let document: Awaited<ReturnType<typeof workspace.openTextDocument>>

    try {
      document = await workspace.openTextDocument(Uri.parse(annotation.uri))
    } catch {
      if (requestGeneration !== explainRequestGeneration) {
        return
      }

      await window.showWarningMessage(
        'Unable to open the annotation document to explain it.',
      )
      return
    }

    if (requestGeneration !== explainRequestGeneration) {
      return
    }

    const prompt = annotationExplanationPrompt(
      { ...annotation, languageId: document.languageId },
      annotationSourceWindow(document.getText(), annotation.line),
    )
    let model: LanguageModelChat | undefined

    try {
      ;[model] = await lm.selectChatModels({ vendor: 'copilot' })
    } catch {
      if (requestGeneration !== explainRequestGeneration) {
        return
      }

      await window.showWarningMessage(
        'Unable to select a Copilot language model to explain this annotation.',
      )
      return
    }

    if (requestGeneration !== explainRequestGeneration) {
      return
    }

    if (!model) {
      await window.showInformationMessage(
        'No Copilot language model is available to explain this annotation.',
      )
      return
    }

    let wasCancelled = false

    try {
      await window.withProgress(
        {
          cancellable: true,
          location: ProgressLocation.Notification,
          title: 'Explaining Code Beacon annotation',
        },
        async (_progress, token) => {
          if (requestGeneration !== explainRequestGeneration) {
            return
          }

          if (token.isCancellationRequested) {
            wasCancelled = true
            return
          }

          const outputChannel = (explainOutputChannel ??=
            window.createOutputChannel('Code Beacon AI'))
          outputChannel.clear()
          outputChannel.append(explanationOutputHeading(annotation))

          try {
            const response = await model.sendRequest(
              prompt.map(message =>
                createLanguageModelUserMessage(message.content),
              ),
              undefined,
              token,
            )
            let receivedText = false

            for await (const part of response.stream) {
              if (requestGeneration !== explainRequestGeneration) {
                break
              }

              if (token.isCancellationRequested) {
                wasCancelled = true
                break
              }

              if (!(part instanceof LanguageModelTextPart)) {
                continue
              }

              outputChannel.append(part.value)

              if (!receivedText) {
                outputChannel.show(true)
                receivedText = true
              }
            }
          } finally {
            wasCancelled ||= token.isCancellationRequested
          }
        },
      )
    } catch {
      if (requestGeneration !== explainRequestGeneration) {
        return
      }

      if (wasCancelled) {
        await window.showInformationMessage('Explanation cancelled.')
        return
      }

      await window.showWarningMessage('Unable to explain this annotation.')
      return
    }

    if (requestGeneration !== explainRequestGeneration) {
      return
    }

    if (wasCancelled) {
      await window.showInformationMessage('Explanation cancelled.')
    }
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
    vscodeCommands.registerCommand(
      commands.createIssue,
      async (value?: unknown) => {
        const annotation = issueAnnotation(value)

        if (!annotation) {
          await window.showWarningMessage(
            'Select a beacon in the Explorer to create an issue body.',
          )
          return
        }

        await env.clipboard.writeText(formatBeaconIssue(annotation).body)
        await window.showInformationMessage('Issue body copied to clipboard.')
      },
    ),
  )
  useDisposable(
    vscodeCommands.registerCommand(BEACON_EXPLAIN_COMMAND, explainAnnotation),
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
