import type { BeaconAnnotation } from '../../types/annotation'
import { compareBeaconAnnotations } from '../explorer/filter'

export const DEFAULT_BEACON_ANNOTATION_LIMIT = 50
export const MAX_BEACON_ANNOTATION_LIMIT = 100

export type BeaconAnnotationToolScope = 'all' | 'activeFile' | 'openEditors'

export interface BeaconListAnnotationsInput {
  readonly scope?: BeaconAnnotationToolScope
  readonly limit?: number
  readonly includeResolved?: boolean
  readonly includeIgnored?: boolean
}

export interface BeaconListAnnotationsContext {
  readonly activeUri: string | undefined
  readonly openUris: readonly string[]
}

export interface NormalizedBeaconListAnnotationsInput {
  readonly scope: BeaconAnnotationToolScope
  readonly limit: number
  readonly includeResolved: boolean
  readonly includeIgnored: boolean
}

export interface BeaconSelectedAnnotationsResult {
  readonly annotations: readonly BeaconAnnotation[]
  readonly returned: number
  readonly scope: BeaconAnnotationToolScope
  readonly total: number
  readonly truncated: boolean
}

export function normalizeBeaconListAnnotationsInput(
  input: BeaconListAnnotationsInput,
): NormalizedBeaconListAnnotationsInput {
  const limit = input.limit

  return {
    includeIgnored: input.includeIgnored === true,
    includeResolved: input.includeResolved === true,
    limit:
      typeof limit === 'number' &&
      Number.isInteger(limit) &&
      limit >= 1 &&
      limit <= MAX_BEACON_ANNOTATION_LIMIT
        ? limit
        : DEFAULT_BEACON_ANNOTATION_LIMIT,
    scope:
      input.scope === 'activeFile' || input.scope === 'openEditors'
        ? input.scope
        : 'all',
  }
}

export function selectBeaconAnnotations(
  annotations: readonly BeaconAnnotation[],
  input: BeaconListAnnotationsInput,
  context: BeaconListAnnotationsContext,
): BeaconSelectedAnnotationsResult {
  const normalizedInput = normalizeBeaconListAnnotationsInput(input)
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
    .toSorted(compareBeaconAnnotations)
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
