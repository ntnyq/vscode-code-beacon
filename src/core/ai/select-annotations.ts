import type { AnnoPulseAnnotation } from '../../types/annotation'
import { compareAnnoPulseAnnotations } from '../explorer/filter'

export const DEFAULT_ANNOPULSE_ANNOTATION_LIMIT = 50
export const MAX_ANNOPULSE_ANNOTATION_LIMIT = 100

export type AnnoPulseAnnotationToolScope = 'all' | 'activeFile' | 'openEditors'

export interface AnnoPulseListAnnotationsInput {
  readonly scope?: AnnoPulseAnnotationToolScope
  readonly limit?: number
  readonly includeResolved?: boolean
  readonly includeIgnored?: boolean
}

export interface AnnoPulseListAnnotationsContext {
  readonly activeUri: string | undefined
  readonly openUris: readonly string[]
}

export interface NormalizedAnnoPulseListAnnotationsInput {
  readonly scope: AnnoPulseAnnotationToolScope
  readonly limit: number
  readonly includeResolved: boolean
  readonly includeIgnored: boolean
}

export interface AnnoPulseSelectedAnnotationsResult {
  readonly annotations: readonly AnnoPulseAnnotation[]
  readonly returned: number
  readonly scope: AnnoPulseAnnotationToolScope
  readonly total: number
  readonly truncated: boolean
}

export function normalizeAnnoPulseListAnnotationsInput(
  input: AnnoPulseListAnnotationsInput,
): NormalizedAnnoPulseListAnnotationsInput {
  const limit = input.limit

  return {
    includeIgnored: input.includeIgnored === true,
    includeResolved: input.includeResolved === true,
    limit:
      typeof limit === 'number' &&
      Number.isInteger(limit) &&
      limit >= 1 &&
      limit <= MAX_ANNOPULSE_ANNOTATION_LIMIT
        ? limit
        : DEFAULT_ANNOPULSE_ANNOTATION_LIMIT,
    scope:
      input.scope === 'activeFile' || input.scope === 'openEditors'
        ? input.scope
        : 'all',
  }
}

export function selectAnnoPulseAnnotations(
  annotations: readonly AnnoPulseAnnotation[],
  input: AnnoPulseListAnnotationsInput,
  context: AnnoPulseListAnnotationsContext,
): AnnoPulseSelectedAnnotationsResult {
  const normalizedInput = normalizeAnnoPulseListAnnotationsInput(input)
  const openUris = new Set(context.openUris)
  const matchingAnnotations = annotations
    .filter(annotation => {
      if (annotation.resolved === true && !normalizedInput.includeResolved) {
        return false
      }

      if (annotation.ignored === true && !normalizedInput.includeIgnored) {
        return false
      }

      if (
        normalizedInput.scope === 'activeFile' &&
        annotation.uri !== context.activeUri
      ) {
        return false
      }

      return (
        normalizedInput.scope !== 'openEditors' || openUris.has(annotation.uri)
      )
    })
    .toSorted(compareAnnoPulseAnnotations)
  const total = matchingAnnotations.length
  const selectedAnnotations = matchingAnnotations.slice(
    0,
    normalizedInput.limit,
  )

  return {
    annotations: selectedAnnotations,
    returned: selectedAnnotations.length,
    scope: normalizedInput.scope,
    total,
    truncated: total > selectedAnnotations.length,
  }
}
