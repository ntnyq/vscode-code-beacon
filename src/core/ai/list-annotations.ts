import type {
  BeaconAnnotation,
  BeaconCategory,
  BeaconSeverity,
} from '../../types/annotation'
import * as annotationSelector from './select-annotations'

export const DEFAULT_BEACON_ANNOTATION_LIMIT =
  annotationSelector.DEFAULT_BEACON_ANNOTATION_LIMIT
export const MAX_BEACON_ANNOTATION_LIMIT =
  annotationSelector.MAX_BEACON_ANNOTATION_LIMIT

export type BeaconAnnotationToolScope =
  annotationSelector.BeaconAnnotationToolScope
export type BeaconListAnnotationsContext =
  annotationSelector.BeaconListAnnotationsContext
export type BeaconListAnnotationsInput =
  annotationSelector.BeaconListAnnotationsInput
export type NormalizedBeaconListAnnotationsInput =
  annotationSelector.NormalizedBeaconListAnnotationsInput

export function normalizeBeaconListAnnotationsInput(
  input: BeaconListAnnotationsInput,
): NormalizedBeaconListAnnotationsInput {
  return annotationSelector.normalizeBeaconListAnnotationsInput(input)
}

export interface BeaconListedAnnotation {
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
  readonly dueDate?: string
  readonly expiresDate?: string
  readonly resolved: boolean
  readonly ignored: boolean
  readonly source: BeaconAnnotation['source']
}

export interface BeaconListAnnotationsResult {
  readonly annotations: readonly BeaconListedAnnotation[]
  readonly returned: number
  readonly scope: BeaconAnnotationToolScope
  readonly total: number
  readonly truncated: boolean
}

function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim()

  return trimmed === undefined || trimmed === '' ? undefined : trimmed
}

export function projectBeaconAnnotation(
  annotation: BeaconAnnotation,
): BeaconListedAnnotation {
  const owner = trimOptional(annotation.owner)
  const dueDate = trimOptional(annotation.dueDate)
  const expiresDate = trimOptional(annotation.expiresDate)

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
    ...(owner === undefined ? {} : { owner }),
    ...(dueDate === undefined ? {} : { dueDate }),
    ...(expiresDate === undefined ? {} : { expiresDate }),
    resolved: annotation.resolved === true,
    ignored: annotation.ignored === true,
    source: annotation.source,
  }
}

export function listBeaconAnnotations(
  annotations: readonly BeaconAnnotation[],
  input: BeaconListAnnotationsInput,
  context: BeaconListAnnotationsContext,
): BeaconListAnnotationsResult {
  const selected = annotationSelector.selectBeaconAnnotations(
    annotations,
    input,
    context,
  )

  return {
    ...selected,
    annotations: selected.annotations.map(projectBeaconAnnotation),
  }
}

export function serializeBeaconListAnnotations(
  result: BeaconListAnnotationsResult,
): string {
  return JSON.stringify(result)
}
