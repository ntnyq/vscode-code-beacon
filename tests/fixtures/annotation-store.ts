import type { AnnotationStore } from '../../src/core/store/annotation-store'
import type { AnnoPulseAnnotation } from '../../src/types/annotation'

/**
 * Seeds test annotations through the same source-aware interface used at runtime.
 */
export function seedAnnotationStore(
  store: AnnotationStore,
  uri: string,
  annotations: readonly AnnoPulseAnnotation[],
  emptySource?: AnnoPulseAnnotation['source'],
) {
  const annotationsBySource = Map.groupBy(
    annotations,
    annotation => annotation.source,
  )

  if (annotationsBySource.size === 0) {
    if (!emptySource) {
      throw new Error('An empty annotation fixture requires a source')
    }

    store.setForSourceUri(emptySource, uri, [])
    return
  }

  for (const [source, sourceAnnotations] of annotationsBySource) {
    store.setForSourceUri(source, uri, sourceAnnotations)
  }
}
