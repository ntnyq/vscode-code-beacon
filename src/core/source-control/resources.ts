import type { AnnoPulseAnnotation } from '../../types/annotation'

export interface AnnoPulseSourceControlResourceDescriptor {
  readonly annotationCount: number
  readonly categories: readonly string[]
  readonly tooltip: string
  readonly uri: string
}

function categorySummary(
  annotations: readonly AnnoPulseAnnotation[],
): string[] {
  return [
    ...new Set(
      annotations.map(annotation => annotation.category.toUpperCase()),
    ),
  ].sort((left, right) => left.localeCompare(right))
}

export function createAnnoPulseSourceControlResources(
  changedUris: ReadonlySet<string>,
  annotations: readonly AnnoPulseAnnotation[],
): readonly AnnoPulseSourceControlResourceDescriptor[] {
  const annotationsByUri = new Map<string, AnnoPulseAnnotation[]>()

  for (const annotation of annotations) {
    if (!changedUris.has(annotation.uri)) {
      continue
    }
    annotationsByUri.set(annotation.uri, [
      ...(annotationsByUri.get(annotation.uri) ?? []),
      annotation,
    ])
  }

  return [...annotationsByUri]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([uri, uriAnnotations]) => {
      const annotationCount = uriAnnotations.length
      const categories = categorySummary(uriAnnotations)
      return {
        annotationCount,
        categories,
        tooltip: `${annotationCount} AnnoPulse annotation${annotationCount === 1 ? '' : 's'} (${categories.join(', ')})`,
        uri,
      }
    })
}
