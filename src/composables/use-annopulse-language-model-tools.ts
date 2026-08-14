import { useDisposable } from 'reactive-vscode'
import {
  LanguageModelTextPart,
  LanguageModelToolResult,
  lm,
  window,
} from 'vscode'
import type { LanguageModelTool } from 'vscode'
import { config } from '../config'
import {
  listAnnoPulseAnnotations,
  normalizeAnnoPulseListAnnotationsInput,
  serializeAnnoPulseListAnnotations,
  type AnnoPulseAnnotationToolScope,
  type AnnoPulseListAnnotationsInput,
} from '../core/ai/list-annotations'
import {
  createAnnoPulseQualityCheck,
  serializeAnnoPulseQualityCheck,
} from '../core/ai/quality-check'
import { annotationStore } from '../core/store/annotation-store'

export const ANNOPULSE_LIST_ANNOTATIONS_TOOL_NAME = 'annopulse_list_annotations'
export const ANNOPULSE_QUALITY_CHECK_TOOL_NAME = 'annopulse_quality_check'

const toolScopeLabel: Record<AnnoPulseAnnotationToolScope, string> = {
  activeFile: 'the active file',
  all: 'all indexed files',
  openEditors: 'open editors',
}

function getCurrentAnnotationSnapshot() {
  if (!config.ai.enabled) {
    throw new Error(
      'AnnoPulse Language Model Tools are disabled. Enable annopulse.ai.enabled to use them.',
    )
  }

  const annotations = annotationStore.getAll()
  const activeUri = window.activeTextEditor?.document.uri.toString()
  const openUris = window.visibleTextEditors.map(editor =>
    editor.document.uri.toString(),
  )

  return { annotations, context: { activeUri, openUris } }
}

/**
 * Registers read-only annotation tools for Language Model clients.
 */
export function useAnnoPulseLanguageModelTools() {
  const listTool: LanguageModelTool<AnnoPulseListAnnotationsInput> = {
    prepareInvocation(options) {
      const normalizedInput = normalizeAnnoPulseListAnnotationsInput(
        options.input,
      )
      const scopeLabel = toolScopeLabel[normalizedInput.scope]

      return {
        invocationMessage: `Listing up to ${normalizedInput.limit} AnnoPulse annotations from ${scopeLabel}.`,
        confirmationMessages: {
          title: 'Share AnnoPulse annotations',
          message: `Share up to ${normalizedInput.limit} already-indexed AnnoPulse annotations from ${scopeLabel} with the agent?`,
        },
      }
    },
    invoke(options) {
      const { annotations, context } = getCurrentAnnotationSnapshot()
      const result = listAnnoPulseAnnotations(
        annotations,
        options.input,
        context,
      )

      return new LanguageModelToolResult([
        new LanguageModelTextPart(serializeAnnoPulseListAnnotations(result)),
      ])
    },
  }

  const qualityTool: LanguageModelTool<AnnoPulseListAnnotationsInput> = {
    prepareInvocation(options) {
      const normalizedInput = normalizeAnnoPulseListAnnotationsInput(
        options.input,
      )
      const scopeLabel = toolScopeLabel[normalizedInput.scope]

      return Promise.resolve({
        invocationMessage: `Checking up to ${normalizedInput.limit} AnnoPulse annotations from ${scopeLabel}.`,
        confirmationMessages: {
          title: 'Share AnnoPulse annotation quality',
          message: `Share quality scores for up to ${normalizedInput.limit} already-indexed AnnoPulse annotations from ${scopeLabel} with the agent?`,
        },
      })
    },
    invoke(options) {
      const { annotations, context } = getCurrentAnnotationSnapshot()
      const result = createAnnoPulseQualityCheck(
        annotations,
        options.input,
        context,
        new Date(),
      )

      return new LanguageModelToolResult([
        new LanguageModelTextPart(serializeAnnoPulseQualityCheck(result)),
      ])
    },
  }

  useDisposable(lm.registerTool(ANNOPULSE_LIST_ANNOTATIONS_TOOL_NAME, listTool))
  useDisposable(lm.registerTool(ANNOPULSE_QUALITY_CHECK_TOOL_NAME, qualityTool))
}
