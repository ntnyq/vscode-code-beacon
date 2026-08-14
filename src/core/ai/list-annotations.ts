import type {
  AnnoPulseAnnotation,
  AnnoPulseCategory,
  AnnoPulseSeverity,
} from '../../types/annotation'
import * as annotationSelector from './select-annotations'

export const DEFAULT_ANNOPULSE_ANNOTATION_LIMIT =
  annotationSelector.DEFAULT_ANNOPULSE_ANNOTATION_LIMIT
export const MAX_ANNOPULSE_ANNOTATION_LIMIT =
  annotationSelector.MAX_ANNOPULSE_ANNOTATION_LIMIT

export type AnnoPulseAnnotationToolScope =
  annotationSelector.AnnoPulseAnnotationToolScope
export type AnnoPulseListAnnotationsContext =
  annotationSelector.AnnoPulseListAnnotationsContext
export type AnnoPulseListAnnotationsInput =
  annotationSelector.AnnoPulseListAnnotationsInput
export type NormalizedAnnoPulseListAnnotationsInput =
  annotationSelector.NormalizedAnnoPulseListAnnotationsInput

export function normalizeAnnoPulseListAnnotationsInput(
  input: AnnoPulseListAnnotationsInput,
): NormalizedAnnoPulseListAnnotationsInput {
  return annotationSelector.normalizeAnnoPulseListAnnotationsInput(input)
}

export interface AnnoPulseListedAnnotation {
  readonly id: string
  readonly uri: string
  readonly line: number
  readonly column: number
  readonly keyword: string
  readonly message: string
  readonly category: AnnoPulseCategory
  readonly severity: AnnoPulseSeverity
  readonly ruleId: string
  readonly owner?: string
  readonly dueDate?: string
  readonly expiresDate?: string
  readonly resolved: boolean
  readonly ignored: boolean
  readonly source: AnnoPulseAnnotation['source']
}

export interface AnnoPulseListAnnotationsResult {
  readonly annotations: readonly AnnoPulseListedAnnotation[]
  readonly returned: number
  readonly scope: AnnoPulseAnnotationToolScope
  readonly total: number
  readonly truncated: boolean
}

function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim()

  return trimmed === undefined || trimmed === '' ? undefined : trimmed
}

export function projectAnnoPulseAnnotation(
  annotation: AnnoPulseAnnotation,
): AnnoPulseListedAnnotation {
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

export function listAnnoPulseAnnotations(
  annotations: readonly AnnoPulseAnnotation[],
  input: AnnoPulseListAnnotationsInput,
  context: AnnoPulseListAnnotationsContext,
): AnnoPulseListAnnotationsResult {
  const selected = annotationSelector.selectAnnoPulseAnnotations(
    annotations,
    input,
    context,
  )

  return {
    ...selected,
    annotations: selected.annotations.map(projectAnnoPulseAnnotation),
  }
}

export function serializeAnnoPulseListAnnotations(
  result: AnnoPulseListAnnotationsResult,
): string {
  return JSON.stringify(result)
}
