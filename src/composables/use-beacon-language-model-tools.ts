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
  listBeaconAnnotations,
  normalizeBeaconListAnnotationsInput,
  serializeBeaconListAnnotations,
  type BeaconAnnotationToolScope,
  type BeaconListAnnotationsInput,
} from '../core/ai/list-annotations'
import {
  createBeaconQualityCheck,
  serializeBeaconQualityCheck,
} from '../core/ai/quality-check'
import { annotationStore } from '../core/store/annotation-store'

export const BEACON_LIST_ANNOTATIONS_TOOL_NAME = 'code_beacon_list_annotations'
export const BEACON_QUALITY_CHECK_TOOL_NAME = 'code_beacon_quality_check'

const toolScopeLabel: Record<BeaconAnnotationToolScope, string> = {
  activeFile: 'the active file',
  all: 'all indexed files',
  openEditors: 'open editors',
}

function getCurrentAnnotationSnapshot() {
  if (!config.ai.enabled) {
    throw new Error(
      'Code Beacon Language Model Tools are disabled. Enable code-beacon.ai.enabled to use them.',
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
export function useBeaconLanguageModelTools() {
  const listTool: LanguageModelTool<BeaconListAnnotationsInput> = {
    prepareInvocation(options) {
      const normalizedInput = normalizeBeaconListAnnotationsInput(options.input)
      const scopeLabel = toolScopeLabel[normalizedInput.scope]

      return {
        invocationMessage: `Listing up to ${normalizedInput.limit} Code Beacon annotations from ${scopeLabel}.`,
        confirmationMessages: {
          title: 'Share Code Beacon annotations',
          message: `Share up to ${normalizedInput.limit} already-indexed Code Beacon annotations from ${scopeLabel} with the agent?`,
        },
      }
    },
    invoke(options) {
      const { annotations, context } = getCurrentAnnotationSnapshot()
      const result = listBeaconAnnotations(annotations, options.input, context)

      return new LanguageModelToolResult([
        new LanguageModelTextPart(serializeBeaconListAnnotations(result)),
      ])
    },
  }

  const qualityTool: LanguageModelTool<BeaconListAnnotationsInput> = {
    prepareInvocation(options) {
      const normalizedInput = normalizeBeaconListAnnotationsInput(options.input)
      const scopeLabel = toolScopeLabel[normalizedInput.scope]

      return Promise.resolve({
        invocationMessage: `Checking up to ${normalizedInput.limit} Code Beacon annotations from ${scopeLabel}.`,
        confirmationMessages: {
          title: 'Share Code Beacon annotation quality',
          message: `Share quality scores for up to ${normalizedInput.limit} already-indexed Code Beacon annotations from ${scopeLabel} with the agent?`,
        },
      })
    },
    invoke(options) {
      const { annotations, context } = getCurrentAnnotationSnapshot()
      const result = createBeaconQualityCheck(
        annotations,
        options.input,
        context,
        new Date(),
      )

      return new LanguageModelToolResult([
        new LanguageModelTextPart(serializeBeaconQualityCheck(result)),
      ])
    },
  }

  useDisposable(lm.registerTool(BEACON_LIST_ANNOTATIONS_TOOL_NAME, listTool))
  useDisposable(lm.registerTool(BEACON_QUALITY_CHECK_TOOL_NAME, qualityTool))
}
