import type { AnnoPulseAnnotation } from '../../types/annotation'
import {
  scoreAnnoPulseAnnotations,
  type AnnoPulseAnnotationQuality,
  type AnnoPulseQualityReport,
} from '../quality/score-annotations'
import {
  projectAnnoPulseAnnotation,
  type AnnoPulseListedAnnotation,
} from './list-annotations'
import {
  selectAnnoPulseAnnotations,
  type AnnoPulseAnnotationToolScope,
  type AnnoPulseListAnnotationsContext,
  type AnnoPulseListAnnotationsInput,
} from './select-annotations'

export interface AnnoPulseQualityCheckAnnotation extends AnnoPulseAnnotationQuality {
  readonly annotation: AnnoPulseListedAnnotation
}

export interface AnnoPulseQualityCheckResult {
  readonly annotations: readonly AnnoPulseQualityCheckAnnotation[]
  readonly counts: AnnoPulseQualityReport['counts']
  readonly returned: number
  readonly scope: AnnoPulseAnnotationToolScope
  readonly total: number
  readonly truncated: boolean
}

export function createAnnoPulseQualityCheck(
  annotations: readonly AnnoPulseAnnotation[],
  input: AnnoPulseListAnnotationsInput,
  context: AnnoPulseListAnnotationsContext,
  now: Date,
): AnnoPulseQualityCheckResult {
  const selected = selectAnnoPulseAnnotations(annotations, input, context)
  const report = scoreAnnoPulseAnnotations(selected.annotations, {
    includeIgnored: true,
    includeResolved: true,
    now,
  })

  return {
    annotations: report.annotations.map((quality, index) => {
      const annotation = selected.annotations[index]

      if (annotation === undefined) {
        throw new Error('Quality report and selected annotations diverged.')
      }

      return {
        ...quality,
        annotation: projectAnnoPulseAnnotation(annotation),
      }
    }),
    counts: report.counts,
    returned: selected.returned,
    scope: selected.scope,
    total: selected.total,
    truncated: selected.truncated,
  }
}

export function serializeAnnoPulseQualityCheck(
  result: AnnoPulseQualityCheckResult,
): string {
  return JSON.stringify(result)
}
