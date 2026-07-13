import type { BeaconAnnotation } from '../../types/annotation'

export interface BeaconSourceControlResourceDescriptor {
  readonly annotationCount: number
  readonly categories: readonly string[]
  readonly tooltip: string
  readonly uri: string
}

function categorySummary(annotations: readonly BeaconAnnotation[]): string[] {
  return [
    ...new Set(
      annotations.map(annotation => annotation.category.toUpperCase()),
    ),
  ].sort((left, right) => left.localeCompare(right))
}

export function createBeaconSourceControlResources(
  changedUris: ReadonlySet<string>,
  annotations: readonly BeaconAnnotation[],
): readonly BeaconSourceControlResourceDescriptor[] {
  const annotationsByUri = new Map<string, BeaconAnnotation[]>()

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
        tooltip: `${annotationCount} Code Beacon annotation${annotationCount === 1 ? '' : 's'} (${categories.join(', ')})`,
        uri,
      }
    })
}
