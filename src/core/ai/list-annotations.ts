import type {
  BeaconAnnotation,
  BeaconCategory,
  BeaconSeverity,
} from '../../types/annotation'
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

export interface BeaconListAnnotationsResult {
  readonly annotations: readonly {
    readonly id: string
    readonly uri: string
    readonly line: number
    readonly column: number
    readonly keyword: string
    readonly message: string
    readonly category: BeaconCategory
    readonly severity: BeaconSeverity
    readonly ruleId: string
    readonly owner?: string
    readonly resolved: boolean
    readonly ignored: boolean
    readonly source: BeaconAnnotation['source']
  }[]
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

export function listBeaconAnnotations(
  annotations: readonly BeaconAnnotation[],
  input: BeaconListAnnotationsInput,
  context: BeaconListAnnotationsContext,
): BeaconListAnnotationsResult {
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
    annotations: selectedAnnotations.map(annotation => {
      const owner = annotation.owner?.trim()

      return {
        id: annotation.id,
        uri: annotation.uri,
        line: annotation.line,
        column: annotation.column,
        keyword: annotation.keyword,
        message: annotation.message,
        category: annotation.category,
        severity: annotation.severity,
        ruleId: annotation.ruleId,
        ...(owner === undefined || owner === '' ? {} : { owner }),
        resolved: annotation.resolved === true,
        ignored: annotation.ignored === true,
        source: annotation.source,
      }
    }),
    returned: selectedAnnotations.length,
    scope: normalizedInput.scope,
    total,
    truncated: total > selectedAnnotations.length,
  }
}

export function serializeBeaconListAnnotations(
  result: BeaconListAnnotationsResult,
): string {
  return JSON.stringify(result)
}
