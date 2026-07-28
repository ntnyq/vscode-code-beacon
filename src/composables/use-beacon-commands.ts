import { useDisposable } from 'reactive-vscode'
import {
  ConfigurationTarget,
  commands as vscodeCommands,
  env,
  LanguageModelChatMessage,
  LanguageModelTextPart,
  lm,
  ProgressLocation,
  Range,
  Uri,
  window,
  WorkspaceEdit,
  workspace,
} from 'vscode'
import type {
  CancellationToken,
  LanguageModelChat,
  Memento,
  OutputChannel,
} from 'vscode'
import { config } from '../config'
import {
  annotationExplanationPrompt,
  annotationSourceWindow,
} from '../core/ai/explain-annotation'
import {
  annotationFixPrompt,
  parseGeneratedFix,
  planGeneratedFix,
} from '../core/ai/generate-annotation-fix'
import {
  createWorkspaceAnnotationSummary,
  workspaceAnnotationSummaryPrompt,
} from '../core/ai/workspace-annotation-summary'
import { decodeAnnotationTarget } from '../core/commands/annotation-target'
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
const BEACON_GENERATE_FIX_COMMAND = 'code-beacon.generateFix'
const BEACON_SUMMARIZE_WORKSPACE_COMMAND = 'code-beacon.summarizeWorkspace'

type GeneratedFixOutcome =
  | 'applied'
  | 'apply-failed'
  | 'document-drift'
  | 'invalid-proposal'
  | 'rejected'
  | undefined

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

function explanationOutputHeading(annotation: BeaconAnnotation): string {
  return [
    '# Code Beacon explanation',
    '',
    `URI: ${annotation.uri}`,
    `Location: line ${annotation.line + 1}, column ${annotation.column + 1}`,
    '',
  ].join('\n')
}

function workspaceSummaryOutputHeading(summary: {
  readonly returned: number
  readonly sent: number
  readonly total: number
  readonly truncated: boolean
}): string {
  return [
    '# Code Beacon workspace summary',
    '',
    `Annotations — total: ${summary.total}; returned: ${summary.returned}; sent: ${summary.sent}; truncated: ${summary.truncated ? 'yes' : 'no'}`,
    '',
  ].join('\n')
}

function annotationCommand(
  action: (annotation: BeaconAnnotation) => void,
): (value: unknown) => void {
  return value => {
    const annotation = decodeAnnotationTarget(value)
    if (annotation) {
      action(annotation)
    }
  }
}

const createLanguageModelUserMessage = LanguageModelChatMessage.User

async function saveAnnotationState(
  previousSave: Promise<void>,
  save: () => PromiseLike<void>,
): Promise<void> {
  try {
    await previousSave
    await save()
  } catch {
    // Persistence is best-effort; the in-memory annotation state remains valid.
  }
}

function shouldStopGeneratedFix(
  requestGeneration: number,
  currentGeneration: number,
  token: CancellationToken,
  markCancelled: () => void,
): boolean {
  if (token.isCancellationRequested) {
    markCancelled()
  }

  return (
    requestGeneration !== currentGeneration || token.isCancellationRequested
  )
}

async function showGeneratedFixOutcome(outcome: GeneratedFixOutcome) {
  switch (outcome) {
    case 'applied': {
      await window.showInformationMessage('Generated fix applied.')
      break
    }
    case 'apply-failed': {
      await window.showWarningMessage('Unable to apply the generated fix.')
      break
    }
    case 'document-drift': {
      await window.showInformationMessage(
        'The annotation document changed; generated fix was not applied.',
      )
      break
    }
    case 'invalid-proposal': {
      await window.showWarningMessage(
        'Generated fix proposal is invalid or no longer safe to apply.',
      )
      break
    }
    case 'rejected': {
      await window.showInformationMessage('Generated fix was not applied.')
      break
    }
  }
}

/**
 * Registers user-facing Code Beacon commands.
 */
export function useBeaconCommands(workspaceState: Memento) {
  const storage = createMementoAnnotationStateStorage(workspaceState)
  let saveChain = Promise.resolve()
  let explainOutputChannel: OutputChannel | undefined
  let workspaceSummaryOutputChannel: OutputChannel | undefined
  let explainRequestGeneration = 0
  let generateFixRequestGeneration = 0
  let workspaceSummaryRequestGeneration = 0

  useDisposable({
    dispose() {
      explainRequestGeneration++
      generateFixRequestGeneration++
      workspaceSummaryRequestGeneration++
      explainOutputChannel?.dispose()
      explainOutputChannel = undefined
      workspaceSummaryOutputChannel?.dispose()
      workspaceSummaryOutputChannel = undefined
    },
  })

  annotationStore.restoreState(storage.load())
  useDisposable({
    dispose: annotationStore.subscribe(() => {
      const state = annotationStore.getState()
      saveChain = saveAnnotationState(saveChain, () => storage.save(state))
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
    const annotation = decodeAnnotationTarget(value)

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

  const generateAnnotationFix = async (value?: unknown) => {
    const annotation = decodeAnnotationTarget(value)

    if (!annotation) {
      await window.showWarningMessage(
        'Select a beacon in the Explorer to generate a fix.',
      )
      return
    }

    if (!config.ai.enabled) {
      await window.showWarningMessage(
        'Enable code-beacon.ai.enabled to generate annotation fixes.',
      )
      return
    }

    const requestGeneration = ++generateFixRequestGeneration
    let document: Awaited<ReturnType<typeof workspace.openTextDocument>>

    try {
      document = await workspace.openTextDocument(Uri.parse(annotation.uri))
    } catch {
      if (requestGeneration !== generateFixRequestGeneration) {
        return
      }

      await window.showWarningMessage(
        'Unable to open the annotation document to generate a fix.',
      )
      return
    }

    if (requestGeneration !== generateFixRequestGeneration) {
      return
    }

    const snapshot = document.getText()
    const prompt = annotationFixPrompt(
      { ...annotation, languageId: document.languageId },
      annotationSourceWindow(snapshot, annotation.line),
    )
    let model: LanguageModelChat | undefined

    try {
      ;[model] = await lm.selectChatModels({ vendor: 'copilot' })
    } catch {
      if (requestGeneration !== generateFixRequestGeneration) {
        return
      }

      await window.showWarningMessage(
        'Unable to select a Copilot language model to generate a fix.',
      )
      return
    }

    if (requestGeneration !== generateFixRequestGeneration) {
      return
    }

    if (!model) {
      await window.showInformationMessage(
        'No Copilot language model is available to generate a fix.',
      )
      return
    }

    let wasCancelled = false
    let progressToken: { readonly isCancellationRequested: boolean } | undefined
    let outcome: GeneratedFixOutcome

    try {
      await window.withProgress(
        {
          cancellable: true,
          location: ProgressLocation.Notification,
          title: 'Generating Code Beacon fix',
        },
        async (_progress, token) => {
          progressToken = token

          const shouldStop = () =>
            shouldStopGeneratedFix(
              requestGeneration,
              generateFixRequestGeneration,
              token,
              () => {
                wasCancelled = true
              },
            )

          if (shouldStop()) {
            return
          }

          const response = await model.sendRequest(
            prompt.map(message =>
              createLanguageModelUserMessage(message.content),
            ),
            undefined,
            token,
          )
          let generatedText = ''

          for await (const part of response.stream) {
            if (shouldStop()) {
              return
            }

            if (part instanceof LanguageModelTextPart) {
              generatedText += part.value
            }
          }

          if (shouldStop()) {
            return
          }

          const parsed = parseGeneratedFix(generatedText)

          if (!parsed.ok) {
            outcome = 'invalid-proposal'
            return
          }

          const plan = planGeneratedFix(annotation, snapshot, parsed.proposal)

          if (!plan.ok) {
            outcome = 'invalid-proposal'
            return
          }

          if (shouldStop()) {
            return
          }

          if (document.getText() !== plan.snapshot) {
            outcome = 'document-drift'
            return
          }

          const edit = new WorkspaceEdit()
          edit.replace(
            Uri.parse(annotation.uri),
            new Range(
              document.positionAt(plan.start),
              document.positionAt(plan.end),
            ),
            plan.replacement,
            {
              label: 'Apply Code Beacon generated fix',
              needsConfirmation: true,
            },
          )

          if (shouldStop()) {
            return
          }

          if (document.getText() !== plan.snapshot) {
            outcome = 'document-drift'
            return
          }

          try {
            const applied = await workspace.applyEdit(edit)
            outcome = applied ? 'applied' : 'rejected'
          } catch {
            outcome = 'apply-failed'
          }
        },
      )
    } catch {
      if (requestGeneration !== generateFixRequestGeneration) {
        return
      }

      if (wasCancelled || progressToken?.isCancellationRequested) {
        await window.showInformationMessage('Generated fix cancelled.')
        return
      }

      await window.showWarningMessage('Unable to generate a fix.')
      return
    }

    if (requestGeneration !== generateFixRequestGeneration) {
      return
    }

    if (wasCancelled || progressToken?.isCancellationRequested) {
      await window.showInformationMessage('Generated fix cancelled.')
      return
    }

    await showGeneratedFixOutcome(outcome)
  }

  const summarizeWorkspaceAnnotations = async () => {
    if (!config.ai.enabled) {
      await window.showWarningMessage(
        'Enable code-beacon.ai.enabled to summarize workspace annotations.',
      )
      return
    }

    const requestGeneration = ++workspaceSummaryRequestGeneration
    const summary = createWorkspaceAnnotationSummary(annotationStore.getAll())

    if (summary.total === 0) {
      await window.showInformationMessage(
        'No unresolved, non-ignored Code Beacon annotations are currently indexed to summarize.',
      )
      return
    }

    const prompt = workspaceAnnotationSummaryPrompt(summary)
    let model: LanguageModelChat | undefined

    try {
      ;[model] = await lm.selectChatModels({ vendor: 'copilot' })
    } catch {
      if (requestGeneration !== workspaceSummaryRequestGeneration) {
        return
      }

      await window.showWarningMessage(
        'Unable to select a Copilot language model to summarize workspace annotations.',
      )
      return
    }

    if (requestGeneration !== workspaceSummaryRequestGeneration) {
      return
    }

    if (!model) {
      await window.showInformationMessage(
        'No Copilot language model is available to summarize workspace annotations.',
      )
      return
    }

    let wasCancelled = false

    try {
      await window.withProgress(
        {
          cancellable: true,
          location: ProgressLocation.Notification,
          title: 'Summarizing Code Beacon workspace annotations',
        },
        async (_progress, token) => {
          if (requestGeneration !== workspaceSummaryRequestGeneration) {
            return
          }

          if (token.isCancellationRequested) {
            wasCancelled = true
            return
          }

          try {
            const response = await model.sendRequest(
              [createLanguageModelUserMessage(prompt)],
              undefined,
              token,
            )

            if (requestGeneration !== workspaceSummaryRequestGeneration) {
              return
            }

            if (token.isCancellationRequested) {
              wasCancelled = true
              return
            }

            const outputChannel = (workspaceSummaryOutputChannel ??=
              window.createOutputChannel('Code Beacon Workspace Summary'))
            outputChannel.clear()
            outputChannel.append(workspaceSummaryOutputHeading(summary))
            let receivedText = false

            for await (const part of response.stream) {
              if (requestGeneration !== workspaceSummaryRequestGeneration) {
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
      if (requestGeneration !== workspaceSummaryRequestGeneration) {
        return
      }

      if (wasCancelled) {
        await window.showInformationMessage('Workspace summary cancelled.')
        return
      }

      await window.showWarningMessage(
        'Unable to summarize workspace annotations.',
      )
      return
    }

    if (requestGeneration !== workspaceSummaryRequestGeneration) {
      return
    }

    if (wasCancelled) {
      await window.showInformationMessage('Workspace summary cancelled.')
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
      annotationCommand(annotation =>
        annotationStore.markResolved(annotation.id, true),
      ),
    ),
  )
  useDisposable(
    vscodeCommands.registerCommand(
      commands.unresolve,
      annotationCommand(annotation =>
        annotationStore.markResolved(annotation.id, false),
      ),
    ),
  )
  useDisposable(
    vscodeCommands.registerCommand(
      commands.ignore,
      annotationCommand(annotation =>
        annotationStore.markIgnored(annotation.id, true),
      ),
    ),
  )
  useDisposable(
    vscodeCommands.registerCommand(
      commands.unignore,
      annotationCommand(annotation =>
        annotationStore.markIgnored(annotation.id, false),
      ),
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
        const annotation = decodeAnnotationTarget(value)

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
    vscodeCommands.registerCommand(
      BEACON_GENERATE_FIX_COMMAND,
      generateAnnotationFix,
    ),
  )
  useDisposable(
    vscodeCommands.registerCommand(
      BEACON_SUMMARIZE_WORKSPACE_COMMAND,
      summarizeWorkspaceAnnotations,
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
