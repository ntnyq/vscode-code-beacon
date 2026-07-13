import type { BeaconAnnotation } from '../../types/annotation'
import {
  scoreBeaconAnnotations,
  type BeaconAnnotationQuality,
  type BeaconQualityReport,
} from '../quality/score-annotations'
import {
  projectBeaconAnnotation,
  type BeaconListedAnnotation,
} from './list-annotations'
import {
  selectBeaconAnnotations,
  type BeaconAnnotationToolScope,
  type BeaconListAnnotationsContext,
  type BeaconListAnnotationsInput,
} from './select-annotations'

export interface BeaconQualityCheckAnnotation extends BeaconAnnotationQuality {
  readonly annotation: BeaconListedAnnotation
}

export interface BeaconQualityCheckResult {
  readonly annotations: readonly BeaconQualityCheckAnnotation[]
  readonly counts: BeaconQualityReport['counts']
  readonly returned: number
  readonly scope: BeaconAnnotationToolScope
  readonly total: number
  readonly truncated: boolean
}

export function createBeaconQualityCheck(
  annotations: readonly BeaconAnnotation[],
  input: BeaconListAnnotationsInput,
  context: BeaconListAnnotationsContext,
  now: Date,
): BeaconQualityCheckResult {
  const selected = selectBeaconAnnotations(annotations, input, context)
  const report = scoreBeaconAnnotations(selected.annotations, {
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
        annotation: projectBeaconAnnotation(annotation),
      }
    }),
    counts: report.counts,
    returned: selected.returned,
    scope: selected.scope,
    total: selected.total,
    truncated: selected.truncated,
  }
}

export function serializeBeaconQualityCheck(
  result: BeaconQualityCheckResult,
): string {
  return JSON.stringify(result)
}
