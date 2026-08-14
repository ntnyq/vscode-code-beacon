import type { AnnoPulseAnnotation } from '../../types/annotation'
import type {
  AiActionCancellation,
  AiActionExecutor,
  AiActionOutcome,
} from '../ai/action-execution'
import {
  annotationExplanationPrompt,
  annotationSourceWindow,
} from '../ai/explain-annotation'
import {
  annotationFixPrompt,
  parseGeneratedFix,
  planGeneratedFix,
} from '../ai/generate-annotation-fix'
import {
  createWorkspaceAnnotationSummary,
  workspaceAnnotationSummaryPrompt,
} from '../ai/workspace-annotation-summary'
import {
  formatAnnotations,
  formatAnnotationsAsMarkdown,
  type AnnoPulseExportFormat,
} from '../export/format'
import { formatAnnoPulseIssue } from '../issues/format'
import type { AnnotationStore } from '../store/annotation-store'
import { decodeAnnotationTarget } from './annotation-target'

type GeneratedFixOutcome =
  | 'applied'
  | 'apply-failed'
  | 'document-drift'
  | 'invalid-proposal'
  | 'rejected'
  | undefined

export interface GeneratedFixApplication {
  readonly end: number
  readonly replacement: string
  readonly start: number
}

export interface AnnoPulseCommandDocument {
  readonly languageId: string
  readonly applyGeneratedFix: (
    application: GeneratedFixApplication,
  ) => PromiseLike<boolean>
  readonly getText: () => string
}

export interface AnnoPulseCommandLanguageModel {
  readonly request: (
    messages: readonly string[],
    token: AiActionCancellation,
  ) => PromiseLike<AsyncIterable<unknown>>
}

export interface AnnoPulseCommandOutput {
  readonly append: (value: string) => void
  readonly clear: () => void
  readonly dispose: () => void
  readonly show: (preserveFocus?: boolean) => void
}

export interface AnnoPulseCommandAdapter {
  readonly aiEnabled: boolean
  readonly enabled: boolean
  readonly createAiActionExecutor: () => AiActionExecutor<AnnoPulseCommandLanguageModel>
  readonly createOutput: (name: string) => AnnoPulseCommandOutput
  readonly openDocument: (uri: string) => PromiseLike<AnnoPulseCommandDocument>
  readonly openExportDocument: (
    format: AnnoPulseExportFormat,
    content: string,
  ) => PromiseLike<unknown>
  readonly openExtensionSettings: () => PromiseLike<unknown>
  readonly setEnabled: (value: boolean) => PromiseLike<unknown>
  readonly showInformation: (message: string) => PromiseLike<unknown>
  readonly showWarning: (message: string) => PromiseLike<unknown>
  readonly writeClipboard: (content: string) => PromiseLike<unknown>
}

export type AnnoPulseCommandHandler = (value?: unknown) => unknown

export interface AnnoPulseCommandHandlers {
  readonly clearCache: AnnoPulseCommandHandler
  readonly copyMarkdown: AnnoPulseCommandHandler
  readonly createIssue: AnnoPulseCommandHandler
  readonly disable: AnnoPulseCommandHandler
  readonly dispose: () => void
  readonly enable: AnnoPulseCommandHandler
  readonly explain: AnnoPulseCommandHandler
  readonly exportAnnotations: (
    format: AnnoPulseExportFormat,
  ) => PromiseLike<unknown>
  readonly exportCsv: AnnoPulseCommandHandler
  readonly exportJson: AnnoPulseCommandHandler
  readonly exportMarkdown: AnnoPulseCommandHandler
  readonly generateFix: AnnoPulseCommandHandler
  readonly ignore: AnnoPulseCommandHandler
  readonly openSettings: AnnoPulseCommandHandler
  readonly resolve: AnnoPulseCommandHandler
  readonly summarizeWorkspace: AnnoPulseCommandHandler
  readonly toggle: AnnoPulseCommandHandler
  readonly unignore: AnnoPulseCommandHandler
  readonly unresolve: AnnoPulseCommandHandler
}

interface AiActionOutcomeMessages {
  readonly cancelled: string
  readonly failed: string
  readonly modelSelectionFailed: string
  readonly modelUnavailable: string
  readonly preparationFailed: string
}

function explanationOutputHeading(annotation: AnnoPulseAnnotation): string {
  return [
    '# AnnoPulse explanation',
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
    '# AnnoPulse workspace summary',
    '',
    `Annotations — total: ${summary.total}; returned: ${summary.returned}; sent: ${summary.sent}; truncated: ${summary.truncated ? 'yes' : 'no'}`,
    '',
  ].join('\n')
}

function annotationCommand(
  action: (annotation: AnnoPulseAnnotation) => void,
): AnnoPulseCommandHandler {
  return value => {
    const annotation = decodeAnnotationTarget(value)
    if (annotation) {
      action(annotation)
    }
  }
}

async function showAiActionOutcome(
  adapter: AnnoPulseCommandAdapter,
  outcome: AiActionOutcome<unknown>,
  messages: AiActionOutcomeMessages,
) {
  switch (outcome.status) {
    case 'cancelled': {
      await adapter.showInformation(messages.cancelled)
      break
    }
    case 'failed': {
      await adapter.showWarning(messages.failed)
      break
    }
    case 'model-selection-failed': {
      await adapter.showWarning(messages.modelSelectionFailed)
      break
    }
    case 'model-unavailable': {
      await adapter.showInformation(messages.modelUnavailable)
      break
    }
    case 'preparation-failed': {
      await adapter.showWarning(messages.preparationFailed)
      break
    }
  }
}

async function showGeneratedFixOutcome(
  adapter: AnnoPulseCommandAdapter,
  outcome: GeneratedFixOutcome,
) {
  switch (outcome) {
    case 'applied': {
      await adapter.showInformation('Generated fix applied.')
      break
    }
    case 'apply-failed': {
      await adapter.showWarning('Unable to apply the generated fix.')
      break
    }
    case 'document-drift': {
      await adapter.showInformation(
        'The annotation document changed; generated fix was not applied.',
      )
      break
    }
    case 'invalid-proposal': {
      await adapter.showWarning(
        'Generated fix proposal is invalid or no longer safe to apply.',
      )
      break
    }
    case 'rejected': {
      await adapter.showInformation('Generated fix was not applied.')
      break
    }
  }
}

/**
 * Creates the business handlers shared by every command registration adapter.
 */
export function createAnnoPulseCommandHandlers(
  adapter: AnnoPulseCommandAdapter,
  annotationStore: AnnotationStore,
): AnnoPulseCommandHandlers {
  let explainOutput: AnnoPulseCommandOutput | undefined
  let workspaceSummaryOutput: AnnoPulseCommandOutput | undefined
  const explainExecutor = adapter.createAiActionExecutor()
  const generateFixExecutor = adapter.createAiActionExecutor()
  const workspaceSummaryExecutor = adapter.createAiActionExecutor()

  const exportAnnotations = (format: AnnoPulseExportFormat) =>
    adapter.openExportDocument(
      format,
      formatAnnotations(annotationStore.getAll(), format),
    )

  const explain = async (value?: unknown) => {
    const annotation = decodeAnnotationTarget(value)

    if (!annotation) {
      await adapter.showWarning(
        'Select an annotation in the Explorer to explain it.',
      )
      return
    }

    if (!adapter.aiEnabled) {
      await adapter.showWarning(
        'Enable annopulse.ai.enabled to explain annotations.',
      )
      return
    }

    explainOutput?.clear()
    const outcome = await explainExecutor.execute({
      async prepare() {
        const document = await adapter.openDocument(annotation.uri)
        return {
          prompt: annotationExplanationPrompt(
            { ...annotation, languageId: document.languageId },
            annotationSourceWindow(document.getText(), annotation.line),
          ),
        }
      },
      progressTitle: 'Explaining AnnoPulse annotation',
      async run({ consumeText, model, prepared, token }) {
        const output = (explainOutput ??= adapter.createOutput('AnnoPulse AI'))
        output.clear()
        output.append(explanationOutputHeading(annotation))

        const stream = await model.request(
          prepared.prompt.map(message => message.content),
          token,
        )
        let receivedText = false

        await consumeText(stream, text => {
          output.append(text)
          if (!receivedText) {
            output.show(true)
            receivedText = true
          }
        })
      },
    })

    await showAiActionOutcome(adapter, outcome, {
      cancelled: 'Explanation cancelled.',
      failed: 'Unable to explain this annotation.',
      modelSelectionFailed:
        'Unable to select a Copilot language model to explain this annotation.',
      modelUnavailable:
        'No Copilot language model is available to explain this annotation.',
      preparationFailed:
        'Unable to open the annotation document to explain it.',
    })
  }

  const generateFix = async (value?: unknown) => {
    const annotation = decodeAnnotationTarget(value)

    if (!annotation) {
      await adapter.showWarning(
        'Select an annotation in the Explorer to generate a fix.',
      )
      return
    }

    if (!adapter.aiEnabled) {
      await adapter.showWarning(
        'Enable annopulse.ai.enabled to generate annotation fixes.',
      )
      return
    }

    const outcome = await generateFixExecutor.execute({
      async prepare() {
        const document = await adapter.openDocument(annotation.uri)
        const snapshot = document.getText()

        return {
          document,
          prompt: annotationFixPrompt(
            { ...annotation, languageId: document.languageId },
            annotationSourceWindow(snapshot, annotation.line),
          ),
          snapshot,
        }
      },
      progressTitle: 'Generating annotation fix',
      async run({ consumeText, model, prepared, shouldStop, token }) {
        const stream = await model.request(
          prepared.prompt.map(message => message.content),
          token,
        )
        const generatedText = await consumeText(stream)

        if (shouldStop()) {
          return
        }

        const parsed = parseGeneratedFix(generatedText)
        if (!parsed.ok) {
          return 'invalid-proposal'
        }

        const plan = planGeneratedFix(
          annotation,
          prepared.snapshot,
          parsed.proposal,
        )
        if (!plan.ok) {
          return 'invalid-proposal'
        }

        if (prepared.document.getText() !== plan.snapshot) {
          return 'document-drift'
        }

        if (shouldStop()) {
          return
        }

        if (prepared.document.getText() !== plan.snapshot) {
          return 'document-drift'
        }

        try {
          const applied = await prepared.document.applyGeneratedFix(plan)
          return applied ? 'applied' : 'rejected'
        } catch {
          return 'apply-failed'
        }
      },
    })

    await showAiActionOutcome(adapter, outcome, {
      cancelled: 'Generated fix cancelled.',
      failed: 'Unable to generate a fix.',
      modelSelectionFailed:
        'Unable to select a Copilot language model to generate a fix.',
      modelUnavailable:
        'No Copilot language model is available to generate a fix.',
      preparationFailed:
        'Unable to open the annotation document to generate a fix.',
    })

    if (outcome.status === 'completed') {
      await showGeneratedFixOutcome(adapter, outcome.value)
    }
  }

  const summarizeWorkspace = async () => {
    if (!adapter.aiEnabled) {
      await adapter.showWarning(
        'Enable annopulse.ai.enabled to summarize workspace annotations.',
      )
      return
    }

    const summary = createWorkspaceAnnotationSummary(annotationStore.getAll())

    if (summary.total === 0) {
      workspaceSummaryExecutor.supersede()
      await adapter.showInformation(
        'No unresolved, non-ignored AnnoPulse annotations are currently indexed to summarize.',
      )
      return
    }

    const prompt = workspaceAnnotationSummaryPrompt(summary)
    const outcome = await workspaceSummaryExecutor.execute({
      prepare: () => ({ prompt, summary }),
      progressTitle: 'Summarizing AnnoPulse workspace annotations',
      async run({ consumeText, model, prepared, shouldStop, token }) {
        const stream = await model.request([prepared.prompt], token)

        if (shouldStop()) {
          return
        }

        const output = (workspaceSummaryOutput ??= adapter.createOutput(
          'AnnoPulse Workspace Summary',
        ))
        output.clear()
        output.append(workspaceSummaryOutputHeading(prepared.summary))
        let receivedText = false

        await consumeText(stream, text => {
          output.append(text)
          if (!receivedText) {
            output.show(true)
            receivedText = true
          }
        })
      },
    })

    await showAiActionOutcome(adapter, outcome, {
      cancelled: 'Workspace summary cancelled.',
      failed: 'Unable to summarize workspace annotations.',
      modelSelectionFailed:
        'Unable to select a Copilot language model to summarize workspace annotations.',
      modelUnavailable:
        'No Copilot language model is available to summarize workspace annotations.',
      preparationFailed: 'Unable to summarize workspace annotations.',
    })
  }

  return {
    clearCache: () => annotationStore.clear(),
    copyMarkdown: value =>
      adapter.writeClipboard(
        formatAnnotationsAsMarkdown(
          value ? [value as AnnoPulseAnnotation] : annotationStore.getAll(),
        ),
      ),
    async createIssue(value) {
      const annotation = decodeAnnotationTarget(value)

      if (!annotation) {
        await adapter.showWarning(
          'Select an annotation in the Explorer to create an issue body.',
        )
        return
      }

      await adapter.writeClipboard(formatAnnoPulseIssue(annotation).body)
      await adapter.showInformation('Issue body copied to clipboard.')
    },
    disable: () => adapter.setEnabled(false),
    dispose() {
      explainExecutor.dispose()
      generateFixExecutor.dispose()
      workspaceSummaryExecutor.dispose()
      explainOutput?.dispose()
      explainOutput = undefined
      workspaceSummaryOutput?.dispose()
      workspaceSummaryOutput = undefined
    },
    enable: () => adapter.setEnabled(true),
    explain,
    exportAnnotations,
    exportCsv: () => exportAnnotations('csv'),
    exportJson: () => exportAnnotations('json'),
    exportMarkdown: () => exportAnnotations('markdown'),
    generateFix,
    ignore: annotationCommand(annotation =>
      annotationStore.markIgnored(annotation.id, true),
    ),
    openSettings: () => adapter.openExtensionSettings(),
    resolve: annotationCommand(annotation =>
      annotationStore.markResolved(annotation.id, true),
    ),
    summarizeWorkspace,
    toggle: () => adapter.setEnabled(!adapter.enabled),
    unignore: annotationCommand(annotation =>
      annotationStore.markIgnored(annotation.id, false),
    ),
    unresolve: annotationCommand(annotation =>
      annotationStore.markResolved(annotation.id, false),
    ),
  }
}
